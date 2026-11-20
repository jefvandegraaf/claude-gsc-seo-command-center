// Turns a snapshot into findings. Plain rules, no AI: every finding shows the numbers behind it.
// Claude (optional) only ranks and explains these findings; it never invents new ones.

// Typical click-through rate by Google position (organic, desktop + mobile blend). Used to spot titles that underperform.
const EXPECTED_CTR = [0, 0.28, 0.155, 0.105, 0.075, 0.055, 0.042, 0.033, 0.027, 0.022, 0.019];
export const expectedCtr = (pos) => (pos < 1 ? EXPECTED_CTR[1] : pos > 10.5 ? 0.012 : EXPECTED_CTR[Math.round(pos)]);

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const change = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : cur ? null : 0);
export const pretty = (path) => {
  if (!path || path === '/') return 'Home page';
  const name = decodeURIComponent(path).replace(/[?#].*$/, '').replace(/^\/|\/$/g, '').split('/').pop().replace(/[-_]+/g, ' ');
  return name.replace(/\b([a-z])/g, (m) => m.toUpperCase());
};

export function headline(snap) {
  const g = snap.gsc;
  const sum = (rows, k) => (rows || []).reduce((t, r) => t + r[k], 0);
  const out = {};
  if (g) {
    out.clicks = { cur: sum(g.pages, 'clicks'), prev: sum(g.prevPages, 'clicks') };
    out.impressions = { cur: sum(g.pages, 'impressions'), prev: sum(g.prevPages, 'impressions') };
  }
  if (snap.fathom) {
    out.visitors = { cur: snap.fathom.visits, prev: snap.fathom.prevVisits };
    if (snap.fathom.conversions || snap.fathom.prevConversions) out.leads = { cur: snap.fathom.conversions, prev: snap.fathom.prevConversions };
    out.ai = { cur: snap.fathom.aiVisits, prev: snap.fathom.prevAiVisits, sources: snap.fathom.aiSources };
  }
  if (snap.ga4) {
    if (!out.visitors) out.visitors = { cur: snap.ga4.sessions, prev: snap.ga4.prevSessions, label: 'Sessions' };
    if (!out.leads) {
      const ev = snap.ga4.events || [];
      const leads = ev.length ? { cur: ev.filter((e) => e.range === 'date_range_0').reduce((t, e) => t + e.count, 0), prev: ev.filter((e) => e.range === 'date_range_1').reduce((t, e) => t + e.count, 0) }
        : { cur: snap.ga4.keyEvents, prev: snap.ga4.prevKeyEvents };
      if (leads.cur || leads.prev) out.leads = leads;
    }
    if (!out.ai) out.ai = { cur: snap.ga4.aiSessions, prev: snap.ga4.prevAiSessions, sources: snap.ga4.aiSources };
  }
  for (const v of Object.values(out)) v.change = change(v.cur, v.prev);
  return out;
}

// state.firstSeen: url → first date this tool saw it (history beats sitemap dates for page age).
export function analyse(snap, state = { firstSeen: {} }) {
  const F = [];
  const g = snap.gsc;
  const now = new Date(snap.takenAt);
  const ageDays = (url) => {
    const seen = state.firstSeen[url];
    const lastmod = snap.sitemap?.find((p) => p.url === url)?.lastmod;
    // lastmod is the last change, so a page is at least that old. firstSeen is when this tool first saw it.
    const dates = [seen, lastmod].filter(Boolean).map((d) => new Date(d).getTime()).filter((t) => !Number.isNaN(t));
    return dates.length ? Math.floor((now - Math.min(...dates)) / 864e5) : null;
  };

  if (g) {
    const totalImpr = g.pages.reduce((t, p) => t + p.impressions, 0) || 1;
    // Thresholds scale with site size, so small local sites still get findings.
    const minImpr = Math.max(30, Math.round(totalImpr / 400));

    // 1. Striking distance: queries on page 1-2 (positions 5-20) with real demand.
    for (const r of g.queryPages) {
      if (r.position >= 5 && r.position <= 20 && r.impressions >= minImpr) {
        F.push({
          type: 'striking', key: `striking:${r.query}`, target: r.url, path: r.path, query: r.query,
          score: (r.impressions / r.position) * (r.position <= 10 ? 1.5 : 1),
          title: `Push "${r.query}" onto page one`,
          evidence: `Position ${r.position} · ${fmt(r.impressions)} impressions · ${fmt(r.clicks)} clicks · ${pretty(r.path)}`,
          metrics: { clicks: r.clicks, impressions: r.impressions, position: r.position, ctr: r.ctr },
        });
      }
    }

    // 2. CTR gap: ranks well but gets fewer clicks than that position usually earns.
    for (const p of g.pages) {
      if (p.position > 0 && p.position <= 8 && p.impressions >= minImpr * 2) {
        const exp = expectedCtr(p.position);
        if (p.ctr < exp * 0.5) {
          const top = g.queryPages.filter((r) => r.url === p.url).sort((a, b) => b.impressions - a.impressions).slice(0, 5).map((r) => r.query);
          F.push({
            type: 'ctr', key: `ctr:${p.path}`, target: p.url, path: p.path, queries: top,
            score: p.impressions * (exp - p.ctr) * 10,
            title: `Rewrite the Google title and description for ${pretty(p.path)}`,
            evidence: `Position ${p.position} but ${pct(p.ctr)} click rate (about ${pct(exp)} is typical) · ${fmt(p.impressions)} impressions`,
            metrics: { clicks: p.clicks, impressions: p.impressions, position: p.position, ctr: p.ctr },
          });
        }
      }
    }

    // 3. Cannibalisation: two or more pages splitting one search.
    const byQuery = new Map();
    for (const r of g.queryPages) { if (!byQuery.has(r.query)) byQuery.set(r.query, []); byQuery.get(r.query).push(r); }
    for (const [query, rows] of byQuery) {
      const total = rows.reduce((t, r) => t + r.impressions, 0);
      const real = rows.filter((r) => r.impressions >= total * 0.15 && r.position <= 30);
      if (real.length >= 2 && total >= minImpr) {
        real.sort((a, b) => b.impressions - a.impressions);
        F.push({
          type: 'cannibal', key: `cannibal:${query}`, target: real[0].url, path: real[0].path, query, pages: real.map((r) => r.path),
          score: total / 2,
          title: `${real.length} pages compete for "${query}"`,
          evidence: real.map((r) => `${r.path} (pos ${r.position}, ${fmt(r.impressions)} impr.)`).join(' vs '),
          metrics: { impressions: total },
        });
      }
    }

    // 4. Decay: pages losing clicks (last 28 days vs the 28 before).
    const before = new Map(g.prevPages.map((p) => [p.path, p]));
    for (const p of g.pages) {
      const was = before.get(p.path);
      if (was && was.clicks >= 15 && p.clicks < was.clicks * 0.7) {
        F.push({
          type: 'decay', key: `decay:${p.path}`, target: p.url, path: p.path,
          score: (was.clicks - p.clicks) * 8,
          title: `Find out why ${pretty(p.path)} is losing clicks`,
          evidence: `${fmt(p.clicks)} clicks, down from ${fmt(was.clicks)} (${change(p.clicks, was.clicks)}%) · position ${was.position} → ${p.position}`,
          metrics: { clicks: p.clicks, impressions: p.impressions, position: p.position, ctr: p.ctr },
        });
      }
    }
    // Pages that vanished completely.
    const nowPaths = new Set(g.pages.map((p) => p.path));
    for (const was of g.prevPages) {
      if (was.clicks >= 15 && !nowPaths.has(was.path)) {
        F.push({ type: 'decay', key: `decay:${was.path}`, target: was.url, path: was.path, score: was.clicks * 10,
          title: `${pretty(was.path)} dropped out of Google results`, evidence: `${fmt(was.clicks)} clicks in the previous 28 days, none since. Check it still loads and isn't set to noindex.`, metrics: { clicks: 0 } });
      }
    }

    // 5. Prune or improve: pages in the sitemap with zero impressions in 90 days, older than 90 days.
    if (snap.sitemap) {
      const seen90 = new Set(g.pages90.map((p) => p.url));
      const dead = snap.sitemap.filter((p) => !seen90.has(p.url)).map((p) => ({ ...p, age: ageDays(p.url) }));
      const old = dead.filter((p) => p.age !== null && p.age >= 90);
      if (old.length) {
        F.push({
          type: 'prune', key: 'prune:list', target: old[0].url, pages: old.slice(0, 25).map((p) => new URL(p.url).pathname),
          score: 40 + old.length * 3,
          title: `Improve, merge or retire ${old.length} page${old.length > 1 ? 's' : ''} Google hasn't shown in 90 days`,
          evidence: old.slice(0, 5).map((p) => new URL(p.url).pathname).join(', ') + (old.length > 5 ? ` and ${old.length - 5} more` : ''),
          metrics: { count: old.length },
        });
      }
      const young = dead.filter((p) => p.age === null || p.age < 90).length;
      if (young) F.push({ type: 'info', key: 'info:young', score: 0, title: `${young} newer page${young > 1 ? 's' : ''} without impressions yet`, evidence: 'Under 90 days old (or age unknown), so they get more time before any pruning advice.' });
    }

    // 6. New searches this period.
    const prevQ = new Set(g.prevQueries.map((q) => q.query));
    const byQ = new Map();
    for (const r of g.queryPages) byQ.set(r.query, (byQ.get(r.query) || 0) + r.impressions);
    const fresh = [...byQ].filter(([q, impr]) => !prevQ.has(q) && impr >= Math.max(10, minImpr / 2)).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (fresh.length) F.push({ type: 'info', key: 'info:new-queries', score: 0, title: 'New searches you started showing up for', evidence: fresh.map(([q, i]) => `"${q}" (${fmt(i)})`).join(', '), queries: fresh.map(([q]) => q) });
  }

  // 7. Not indexed.
  const notIndexed = (snap.inspection || []).filter((r) => r.verdict && r.verdict !== 'PASS');
  if (notIndexed.length) {
    F.push({
      type: 'index', key: 'index:not-indexed', target: notIndexed[0].url, pages: notIndexed.map((r) => `${new URL(r.url).pathname} (${r.coverage || r.verdict})`),
      score: 60 + notIndexed.length * 5,
      title: `${notIndexed.length} page${notIndexed.length > 1 ? 's are' : ' is'} not in Google's index`,
      evidence: notIndexed.slice(0, 4).map((r) => `${new URL(r.url).pathname}: ${r.coverage || r.verdict}`).join(' · '),
      metrics: { count: notIndexed.length },
    });
  }

  // 8. Speed.
  for (const s of snap.speed || []) {
    if (s.score < 50) {
      F.push({ type: 'speed', key: `speed:${new URL(s.url).pathname}`, target: s.url, path: new URL(s.url).pathname, score: (50 - s.score) * 3,
        title: `Speed up ${pretty(new URL(s.url).pathname)} on phones`, wins: s.wins,
        evidence: `PageSpeed ${s.score}/100 on mobile · LCP ${s.lcp} · biggest wins: ${s.wins.join('; ') || 'see report'}`, metrics: { speed: s.score } });
    }
  }

  // Keep the strongest finding per page for page-level types, so one page doesn't fill the list.
  const tasks = F.filter((f) => f.type !== 'info').sort((a, b) => b.score - a.score);
  const seenPage = new Map();
  const deduped = tasks.filter((f) => {
    if (!['striking', 'ctr', 'decay'].includes(f.type)) return true;
    const n = seenPage.get(f.path) || 0;
    seenPage.set(f.path, n + 1);
    return n < 2;
  });
  return { findings: deduped.slice(0, 25), info: F.filter((f) => f.type === 'info') };
}
