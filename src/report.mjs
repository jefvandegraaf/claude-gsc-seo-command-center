// The "how the site did" half of the digest: lead mix, Google week by week, top pages and searches,
// growing searches, devices and AI visitors. Plain numbers from the snapshot, no judgement.

// Lead types and their colours (the same set as the client reports on jefvandegraaf.com).
export const LEAD_TYPES = [
  { key: 'phone', label: 'Phone clicks', color: '#2f5bff', re: /phone|call|tel/i },
  { key: 'email', label: 'Email clicks', color: '#6b4eff', re: /e-?mail|mailto/i },
  { key: 'bookings', label: 'Bookings', color: '#b26a00', re: /book|appoint|schedul|calendar/i },
  { key: 'forms', label: 'Form submissions', color: '#1f8a4c', re: /./ }, // anything else: forms, quotes, leads
];
const typeOf = (name) => LEAD_TYPES.find((t) => t.re.test(name)) || LEAD_TYPES[3];

function leadMix(snap) {
  let events = snap.fathom?.events;
  if (!events?.length && snap.ga4?.events?.length) {
    const by = new Map();
    for (const e of snap.ga4.events) {
      const o = by.get(e.name) || { name: e.name, cur: 0, prev: 0 };
      if (e.range === 'date_range_0') o.cur += e.count; else o.prev += e.count;
      by.set(e.name, o);
    }
    events = [...by.values()];
  }
  if (!events?.length) return [];
  return LEAD_TYPES.map((t) => {
    const mine = events.filter((e) => typeOf(e.name) === t);
    return { ...t, re: undefined, cur: mine.reduce((s, e) => s + e.cur, 0), prev: mine.reduce((s, e) => s + e.prev, 0) };
  }).filter((t) => t.cur || t.prev);
}

// Clicks per week (Monday-based) from Search Console's daily rows, oldest first, full weeks only.
function weeks(daily) {
  if (!daily?.length) return [];
  const by = new Map();
  for (const d of daily) {
    const day = new Date(`${d.date}T00:00:00Z`);
    const monday = new Date(day); monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    const k = monday.toISOString().slice(0, 10);
    const o = by.get(k) || { week: k, clicks: 0, days: 0 };
    o.clicks += d.clicks; o.days++;
    by.set(k, o);
  }
  return [...by.values()].filter((w) => w.days === 7).sort((a, b) => a.week.localeCompare(b.week)).slice(-8);
}

function rising(snap) {
  const prev = new Map((snap.gsc?.prevQueries || []).map((q) => [q.query, q.clicks]));
  const cur = new Map();
  for (const r of snap.gsc?.queryPages || []) cur.set(r.query, (cur.get(r.query) || 0) + r.clicks);
  return [...cur].filter(([q]) => prev.has(q)).map(([query, clicks]) => ({ query, change: clicks - prev.get(query) }))
    .filter((r) => r.change > 0).sort((a, b) => b.change - a.change).slice(0, 3);
}

export function reportData(snap) {
  const g = snap.gsc;
  const byQuery = new Map();
  for (const r of g?.queryPages || []) byQuery.set(r.query, (byQuery.get(r.query) || 0) + r.clicks);
  const ai = snap.fathom?.aiSources?.map((x) => ({ source: x.source, visits: x.visits }))
    || snap.ga4?.aiSources?.map((x) => ({ source: x.source, visits: x.sessions })) || [];
  return {
    mix: leadMix(snap),
    weeks: weeks(g?.daily),
    topPages: (g?.pages || []).slice().sort((a, b) => b.clicks - a.clicks).slice(0, 5).map((p) => ({ path: p.path, clicks: p.clicks })),
    topQueries: [...byQuery].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([query, clicks]) => ({ query, clicks })),
    rising: rising(snap),
    devices: g?.devices || {},
    ai: ai.sort((a, b) => b.visits - a.visits).slice(0, 5),
  };
}
