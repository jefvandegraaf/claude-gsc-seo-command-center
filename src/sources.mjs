// Data sources: Google Search Console, GA4, Fathom, PageSpeed Insights, the site's sitemap.
// Everything is read-only. Google access is a service account the site owner adds as a user
// on their Search Console property and GA4 property (see docs/setup-google.md).
import { createSign } from 'node:crypto';

export class SourceError extends Error {}

const UA = 'claude-gsc-seo-command-center/1.0 (+https://github.com/jefvandegraaf/claude-gsc-seo-command-center)';
const b64u = (buf) => Buffer.from(buf).toString('base64url');

async function http(url, opts = {}, label = 'request') {
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, { ...opts, headers: { 'user-agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 60000) });
    } catch (e) {
      if (attempt === 2) throw new SourceError(`${label}: couldn't connect (${e.cause?.code || e.name}).`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return res;
}

// ── Google auth (service account → access token) ──
const tokenCache = new Map();
export async function googleToken(serviceAccountJson) {
  if (!serviceAccountJson) throw new SourceError('Google isn\'t connected: add the service account JSON key.');
  let key;
  try { key = JSON.parse(serviceAccountJson); } catch { throw new SourceError('The Google service account key isn\'t valid JSON.'); }
  const cached = tokenCache.get(key.client_email);
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const res = await http('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64u(sig)}` }),
  }, 'Google sign-in');
  if (!res.ok) throw new SourceError(`Google sign-in failed (${res.status}). Check the service account key.`);
  const j = await res.json();
  tokenCache.set(key.client_email, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}
export const serviceAccountEmail = (json) => { try { return JSON.parse(json).client_email || ''; } catch { return ''; } };

// ── Search Console ──
export async function gscProperties(token) {
  const res = await http('https://searchconsole.googleapis.com/webmasters/v3/sites', { headers: { authorization: `Bearer ${token}` } }, 'Search Console');
  if (!res.ok) throw new SourceError(`Search Console answered ${res.status}.`);
  return ((await res.json()).siteEntry || []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser').map((s) => s.siteUrl).sort();
}

export async function gscQuery(token, property, body) {
  const rows = [];
  const pageSize = Math.min(body.rowLimit || 25000, 25000);
  for (let startRow = 0; ; startRow += pageSize) {
    const res = await http(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'web', dataState: 'final', ...body, rowLimit: pageSize, startRow }),
    }, 'Search Console');
    if (res.status === 403) throw new SourceError(`Search Console: add the service account as a user on ${property}.`);
    if (!res.ok) throw new SourceError(`Search Console answered ${res.status}.`);
    const got = (await res.json()).rows || [];
    rows.push(...got);
    if (got.length < pageSize || rows.length >= (body.maxRows || 50000)) break;
  }
  return rows;
}

// Up to `limit` URL Inspection calls (Google allows about 2,000 a day per property).
export async function inspectUrls(token, property, urls, limit = 20) {
  const out = [];
  for (const url of urls.slice(0, limit)) {
    const res = await http('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
    }, 'URL Inspection');
    if (!res.ok) { out.push({ url, error: res.status }); continue; }
    const r = (await res.json()).inspectionResult?.indexStatusResult || {};
    out.push({ url, verdict: r.verdict, coverage: r.coverageState, lastCrawl: r.lastCrawlTime || null });
  }
  return out;
}

// ── GA4 ──
export async function ga4Report(token, propertyId, body) {
  const res = await http(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }, 'GA4');
  if (res.status === 403) throw new SourceError(`GA4: add the service account as a Viewer on property ${propertyId}.`);
  if (!res.ok) throw new SourceError(`GA4 answered ${res.status}.`);
  const j = await res.json();
  const dims = (j.dimensionHeaders || []).map((d) => d.name);
  const mets = (j.metricHeaders || []).map((m) => m.name);
  return (j.rows || []).map((r) => ({
    ...Object.fromEntries(dims.map((d, i) => [d, r.dimensionValues[i].value])),
    ...Object.fromEntries(mets.map((m, i) => [m, Number(r.metricValues[i].value) || 0])),
  }));
}

// ── Fathom ──
export async function fathom(tokenValue, path, params) {
  if (!tokenValue) throw new SourceError('Fathom isn\'t connected: add your Fathom API token.');
  const res = await http(`https://api.usefathom.com/v1/${path}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${tokenValue}` } }, 'Fathom');
  if (res.status === 401) throw new SourceError('Fathom rejected the API token.');
  if (!res.ok) throw new SourceError(`Fathom answered ${res.status}.`);
  return res.json();
}

// ── PageSpeed Insights ──
export async function pageSpeed(url, key, strategy = 'mobile') {
  const q = new URLSearchParams({ url, strategy, category: 'performance' });
  if (key) q.set('key', key);
  const res = await http(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { timeout: 120000 }, 'PageSpeed Insights');
  if (!res.ok) throw new SourceError(`PageSpeed Insights answered ${res.status}${res.status === 429 ? ' (add a free PSI API key)' : ''}.`);
  const j = await res.json();
  const a = j.lighthouseResult?.audits || {};
  const field = j.loadingExperience?.metrics || {};
  return {
    url, strategy,
    score: Math.round((j.lighthouseResult?.categories?.performance?.score ?? 0) * 100),
    lcp: a['largest-contentful-paint']?.displayValue || null,
    cls: a['cumulative-layout-shift']?.displayValue || null,
    tbt: a['total-blocking-time']?.displayValue || null,
    fieldLcpMs: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    fieldInpMs: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    wins: Object.values(a).filter((x) => x.details?.type === 'opportunity' && x.details.overallSavingsMs > 150 && x.score < 0.9)
      .sort((x, y) => y.details.overallSavingsMs - x.details.overallSavingsMs).slice(0, 4).map((x) => x.title),
  };
}

// ── Sitemap (with <lastmod>, to know page ages) ──
export async function sitemapPages(siteUrl, max = 2000) {
  const origin = new URL(siteUrl).origin;
  const robots = await http(`${origin}/robots.txt`, {}, 'robots.txt').then((r) => (r.ok ? r.text() : '')).catch(() => '');
  const queue = [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
  if (!queue.length) queue.push(`${origin}/sitemap.xml`);
  const pages = new Map();
  for (let i = 0; i < queue.length && i < 30 && pages.size < max; i++) {
    const body = await http(queue[i], {}, 'sitemap').then((r) => (r.ok ? r.text() : '')).catch(() => '');
    if (/<sitemapindex/i.test(body)) { queue.push(...[...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])); continue; }
    for (const u of body.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
      const loc = u[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)?.[1]?.replace(/&amp;/g, '&');
      const lastmod = u[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i)?.[1] || null;
      if (loc && new URL(loc).host === new URL(siteUrl).host) pages.set(loc, lastmod);
    }
  }
  return [...pages].map(([url, lastmod]) => ({ url, lastmod }));
}
