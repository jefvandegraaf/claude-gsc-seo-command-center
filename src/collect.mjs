// Pulls one site's data into a snapshot. Each source is optional; a failing source is recorded, not fatal.
import { googleToken, gscQuery, inspectUrls, ga4Report, fathom, pageSpeed, sitemapPages, SourceError } from './sources.mjs';

export const AI_SOURCES = /(chatgpt\.com|chat\.openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|claude\.ai|you\.com|phind\.com|meta\.ai|deepseek\.com|grok\.com|bing\.com\/chat)/i;

const day = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n, from = new Date()) => { const d = new Date(from); d.setUTCDate(d.getUTCDate() - n); return d; };

// Search Console data is about 3 days behind. Windows end 3 days ago.
export function windows(now = new Date()) {
  const end = daysAgo(3, now);
  return {
    cur: { startDate: day(daysAgo(27, end)), endDate: day(end) },
    prev: { startDate: day(daysAgo(55, end)), endDate: day(daysAgo(28, end)) },
    d90: { startDate: day(daysAgo(89, end)), endDate: day(end) },
  };
}

const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
// Google lists /page/#section as its own row. Fold those into the page.
function foldPages(rows) {
  const by = new Map();
  for (const r of rows) {
    const url = r.keys[r.keys.length - 1].split('#')[0];
    const key = r.keys.length > 1 ? `${r.keys[0]}\u0000${url}` : url;
    const o = by.get(key) || { ...(r.keys.length > 1 ? { query: r.keys[0] } : {}), url, path: pathOf(url), clicks: 0, impressions: 0, posSum: 0 };
    o.clicks += r.clicks; o.impressions += r.impressions; o.posSum += r.position * r.impressions;
    by.set(key, o);
  }
  return [...by.values()].map(({ posSum, ...o }) => ({ ...o, position: o.impressions ? +(posSum / o.impressions).toFixed(1) : 0, ctr: o.impressions ? +(o.clicks / o.impressions).toFixed(4) : 0 }));
}
const hidden = (rows, hide) => rows.filter((r) => !r.query || !(hide || []).some((h) => h && r.query.toLowerCase().includes(h.toLowerCase())));

export async function collect(site, secrets, { now = new Date(), log = () => {} } = {}) {
  const w = windows(now);
  const snap = { site: site.id, url: site.url, takenAt: now.toISOString(), windows: w, errors: [], sources: {} };
  const grab = async (label, fn) => {
    try { const v = await fn(); snap.sources[label] = true; return v; } catch (e) {
      snap.errors.push(`${label}: ${e instanceof SourceError ? e.message : e.message || 'failed'}`);
      snap.sources[label] = false; return null;
    }
  };

  const needsGoogle = site.gscProperty || site.ga4PropertyId;
  const token = needsGoogle ? await grab('google', () => googleToken(secrets.googleServiceAccount)) : null;

  // ── Search Console ──
  if (site.gscProperty && token) {
    log('Search Console…');
    await grab('gsc', async () => {
      const q = (range, dimensions, extra = {}) => gscQuery(token, site.gscProperty, { ...range, dimensions, ...extra });
      const [pages, prevPages, pages90, queryPages, prevQueries, daily] = await Promise.all([
        q(w.cur, ['page']), q(w.prev, ['page']), q(w.d90, ['page']),
        q(w.cur, ['query', 'page'], { maxRows: 50000 }), q(w.prev, ['query'], { maxRows: 25000 }),
        q({ startDate: w.prev.startDate, endDate: w.cur.endDate }, ['date']),
      ]);
      snap.gsc = {
        pages: foldPages(pages), prevPages: foldPages(prevPages), pages90: foldPages(pages90),
        queryPages: hidden(foldPages(queryPages), site.hideQueries),
        prevQueries: hidden(prevQueries.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: +r.position.toFixed(1) })), site.hideQueries),
        daily: daily.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
      };
    });
  }

  // ── Sitemap + index status ──
  if (site.url) {
    log('Sitemap…');
    snap.sitemap = await grab('sitemap', () => sitemapPages(site.url));
  }

  // ── GA4 ──
  if (site.ga4PropertyId && token) {
    log('GA4…');
    await grab('ga4', async () => {
      const range = (r) => ({ startDate: r.startDate, endDate: r.endDate });
      const [sources, prevSources] = await Promise.all([w.cur, w.prev].map((r) => ga4Report(token, site.ga4PropertyId, {
        dateRanges: [range(r)], dimensions: [{ name: 'sessionSource' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }], limit: 200,
      })));
      let events = [];
      const wanted = site.conversions?.ga4Events || [];
      if (wanted.length) {
        events = await ga4Report(token, site.ga4PropertyId, {
          dateRanges: [range(w.cur), range(w.prev)], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
          dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: wanted } } },
        });
      }
      const sum = (rows, k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
      snap.ga4 = {
        sessions: sum(sources, 'sessions'), prevSessions: sum(prevSources, 'sessions'),
        keyEvents: sum(sources, 'keyEvents'), prevKeyEvents: sum(prevSources, 'keyEvents'),
        aiSessions: sum(sources.filter((r) => AI_SOURCES.test(r.sessionSource)), 'sessions'),
        prevAiSessions: sum(prevSources.filter((r) => AI_SOURCES.test(r.sessionSource)), 'sessions'),
        aiSources: sources.filter((r) => AI_SOURCES.test(r.sessionSource)).map((r) => ({ source: r.sessionSource, sessions: r.sessions })),
        events: events.map((r) => ({ name: r.eventName, range: r.dateRange, count: r.eventCount })),
      };
    });
  }

  // ── Fathom ──
  if (site.fathomSiteId) {
    log('Fathom…');
    await grab('fathom', async () => {
      const when = (r) => ({ date_from: `${r.startDate} 00:00:00`, date_to: `${r.endDate} 23:59:59` });
      const agg = (r, extra) => fathom(secrets.fathomApiToken, 'aggregations', { entity: 'pageview', entity_id: site.fathomSiteId, aggregates: 'visits,pageviews', ...when(r), ...extra });
      const [cur, prev, refs, prevRefs] = await Promise.all([
        agg(w.cur), agg(w.prev),
        agg(w.cur, { field_grouping: 'referrer_hostname', sort_by: 'visits:desc', limit: '100' }),
        agg(w.prev, { field_grouping: 'referrer_hostname', sort_by: 'visits:desc', limit: '100' }),
      ]);
      const conv = async (r) => {
        let total = 0;
        for (const name of site.conversions?.fathomEvents || []) {
          const rows = await fathom(secrets.fathomApiToken, 'aggregations', { entity: 'event', site_id: site.fathomSiteId, entity_name: name, aggregates: 'conversions', ...when(r) });
          total += Number(rows?.[0]?.conversions || 0);
        }
        return total;
      };
      const ai = (rows) => (rows || []).filter((x) => AI_SOURCES.test(x.referrer_hostname || ''));
      snap.fathom = {
        visits: Number(cur?.[0]?.visits || 0), prevVisits: Number(prev?.[0]?.visits || 0),
        conversions: await conv(w.cur), prevConversions: await conv(w.prev),
        aiVisits: ai(refs).reduce((t, x) => t + Number(x.visits || 0), 0),
        prevAiVisits: ai(prevRefs).reduce((t, x) => t + Number(x.visits || 0), 0),
        aiSources: ai(refs).map((x) => ({ source: x.referrer_hostname, visits: Number(x.visits || 0) })),
      };
    });
  }

  // ── PageSpeed (mobile) ──
  if (site.url && (site.psiPages || []).length) {
    log('PageSpeed Insights…');
    snap.speed = [];
    for (const p of site.psiPages.slice(0, 3)) {
      const r = await grab('speed', () => pageSpeed(new URL(p, site.url).href, secrets.psiApiKey, 'mobile'));
      if (r) snap.speed.push(r);
    }
  }

  // ── Index status: sitemap pages Google hasn't shown, plus the 10 busiest pages ──
  if (site.gscProperty && token && snap.sitemap && snap.gsc) {
    log('URL Inspection…');
    const seen = new Set(snap.gsc.pages90.map((p) => p.url));
    const unseen = snap.sitemap.filter((p) => !seen.has(p.url)).map((p) => p.url);
    const busiest = [...snap.gsc.pages].sort((a, b) => b.clicks - a.clicks).slice(0, 5).map((p) => p.url);
    snap.inspection = await grab('inspection', () => inspectUrls(token, site.gscProperty, [...unseen.slice(0, 15), ...busiest], 20));
  }

  return snap;
}
