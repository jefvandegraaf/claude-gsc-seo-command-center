// Demo data for a fictional business, so anyone can see the command center work before connecting Google.
// Northline Plumbing is not real. Every number here is made up: a busy local site with ~31,000 visitors a month.
import { windows } from './collect.mjs';

export const DEMO_SITE = {
  id: 'demo-northline-plumbing', name: 'Northline Plumbing (demo)', url: 'https://northlineplumbing.example/',
  gscProperty: 'sc-domain:northlineplumbing.example', recipients: [], psiPages: ['/'],
  brand: { name: 'Demo Agency', logoUrl: '', color: '#1F4E79', replyTo: '' },
  conversions: { fathomEvents: ['form_submit', 'phone_click', 'email_click', 'booking_click'], ga4Events: [] },
};

const P = (path) => `https://northlineplumbing.example${path}`;
const row = (path, clicks, impressions, position, query) => ({ ...(query ? { query } : {}), url: P(path), path, clicks, impressions, position, ctr: impressions ? +(clicks / impressions).toFixed(4) : 0 });

// [path, clicks, impressions, position] for the last 28 days and the 28 before.
const CUR = [
  ['/', 5200, 61000, 2.6], ['/water-heater-replacement/', 2400, 88000, 6.2], ['/drain-cleaning/', 1900, 42000, 4.4],
  ['/emergency-plumber-toronto/', 640, 96000, 2.7], ['/galvanized-pipe-replacement/', 820, 36000, 11.8],
  ['/blog/why-is-my-water-heater-leaking/', 1700, 70000, 8.9], ['/blog/water-heater-leaking-from-top/', 690, 41000, 9.6],
  ['/tankless-water-heaters/', 1450, 39000, 5.1], ['/sump-pump-installation/', 1120, 27000, 4.2], ['/basement-waterproofing/', 960, 31000, 7.4],
  ['/leslieville-plumber/', 380, 16000, 9.2], ['/about/', 540, 6000, 1.9], ['/contact/', 820, 7800, 1.8],
];
const PREV = [
  ['/', 4300, 55000, 2.9], ['/water-heater-replacement/', 2000, 80000, 6.6], ['/drain-cleaning/', 3100, 43000, 3.1],
  ['/emergency-plumber-toronto/', 560, 90000, 2.9], ['/galvanized-pipe-replacement/', 610, 30000, 12.4],
  ['/blog/why-is-my-water-heater-leaking/', 1500, 64000, 9.1], ['/blog/water-heater-leaking-from-top/', 520, 36000, 10.1],
  ['/tankless-water-heaters/', 980, 31000, 6.0], ['/sump-pump-installation/', 870, 24000, 4.8], ['/basement-waterproofing/', 700, 26000, 8.0],
  ['/leslieville-plumber/', 240, 12000, 11.0], ['/about/', 480, 5600, 2.0], ['/contact/', 700, 7100, 1.9], ['/blog/sump-pump-guide/', 400, 15000, 6.5],
];
// [query, page, clicks, impressions, position, clicks in the previous 28 days or null if new]
const QUERIES = [
  ['northline plumbing', '/', 3400, 9000, 1.2, 3100],
  ['drain cleaning toronto', '/drain-cleaning/', 1100, 19000, 4.0, 1900],
  ['water heater replacement toronto', '/water-heater-replacement/', 980, 38000, 7.4, 820],
  ['water heater leaking', '/blog/why-is-my-water-heater-leaking/', 760, 31000, 9.3, 700],
  ['water heater leaking', '/blog/water-heater-leaking-from-top/', 290, 24000, 10.4, null],
  ['plumber east toronto', '/', 640, 21000, 6.8, 560],
  ['tankless water heater toronto', '/tankless-water-heaters/', 610, 11000, 4.4, 380],
  ['sump pump installation toronto', '/sump-pump-installation/', 520, 9800, 3.9, 410],
  ['tankless water heater cost', '/tankless-water-heaters/', 420, 16000, 8.6, null],
  ['emergency plumber toronto', '/emergency-plumber-toronto/', 380, 61000, 2.5, 340],
  ['basement waterproofing cost', '/basement-waterproofing/', 330, 12500, 8.1, 250],
  ['galvanized pipe replacement cost', '/galvanized-pipe-replacement/', 310, 14000, 11.2, 230],
  ['plumber leslieville', '/leslieville-plumber/', 210, 8800, 9.0, 90],
  ['hot water tank leaking from bottom', '/blog/why-is-my-water-heater-leaking/', 180, 9400, 12.0, null],
];

// Daily clicks for 56 days: steady growth, quieter weekends, matching the 28-day totals.
function daily(w, curTotal, prevTotal) {
  const days = [];
  const start = new Date(`${w.prev.startDate}T00:00:00Z`);
  for (let i = 0; i < 56; i++) {
    const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
    const weekend = [0, 6].includes(d.getUTCDay());
    days.push({ date: d.toISOString().slice(0, 10), weight: (1 + i * 0.004) * (weekend ? 0.72 : 1) });
  }
  const fill = (part, total) => { const sum = part.reduce((t, x) => t + x.weight, 0); return part.map((x) => ({ date: x.date, clicks: Math.round((x.weight / sum) * total), impressions: Math.round((x.weight / sum) * total * 30) })); };
  return [...fill(days.slice(0, 28), prevTotal), ...fill(days.slice(28), curTotal)];
}

export function demoSnapshot(now = new Date()) {
  const w = windows(now);
  const pages = CUR.map(([p, c, i, pos]) => row(p, c, i, pos));
  const prevPages = PREV.map(([p, c, i, pos]) => row(p, c, i, pos));
  const queryPages = QUERIES.map(([q, p, c, i, pos]) => row(p, c, i, pos, q));
  const prevQueries = QUERIES.filter((q) => q[5] !== null).map(([query, , , impressions, position, clicks]) => ({ query, clicks, impressions: Math.round(impressions * 0.9), position }));
  const sum = (rows) => rows.reduce((t, r) => t + r.clicks, 0);
  const pages90 = [...pages, row('/blog/sump-pump-guide/', 800, 30000, 6.9)];
  const old = new Date(now); old.setUTCFullYear(old.getUTCFullYear() - 1);
  const recent = new Date(now); recent.setUTCDate(recent.getUTCDate() - 20);
  const sitemap = [
    ...pages90.map((p) => ({ url: p.url, lastmod: old.toISOString().slice(0, 10) })),
    { url: P('/blog/plumbing-tips-2021/'), lastmod: '2021-06-01' },
    { url: P('/blog/our-new-van/'), lastmod: '2022-03-14' },
    { url: P('/services/old-landing-page/'), lastmod: '2023-01-09' },
    { url: P('/riverdale-plumber/'), lastmod: recent.toISOString().slice(0, 10) },
  ];
  const events = [
    { name: 'phone_click', cur: 241, prev: 205 }, { name: 'form_submit', cur: 186, prev: 151 },
    { name: 'booking_click', cur: 97, prev: 66 }, { name: 'email_click', cur: 38, prev: 41 },
  ];
  return {
    site: DEMO_SITE.id, url: DEMO_SITE.url, takenAt: now.toISOString(), windows: w, errors: [], demo: true,
    sources: { gsc: true, sitemap: true, fathom: true, speed: true, inspection: true },
    gsc: { pages, prevPages, pages90, queryPages, prevQueries, daily: daily(w, sum(pages), sum(prevPages)), devices: { mobile: 11550, desktop: 6520, tablet: 550 } },
    sitemap,
    fathom: {
      visits: 31480, prevVisits: 27950,
      conversions: events.reduce((t, e) => t + e.cur, 0), prevConversions: events.reduce((t, e) => t + e.prev, 0), events,
      aiVisits: 412, prevAiVisits: 256,
      aiSources: [{ source: 'chatgpt.com', visits: 231 }, { source: 'perplexity.ai', visits: 96 }, { source: 'copilot.microsoft.com', visits: 51 }, { source: 'gemini.google.com', visits: 34 }],
    },
    speed: [{ url: P('/'), strategy: 'mobile', score: 46, lcp: '4.1 s', cls: '0.12', tbt: '410 ms', fieldLcpMs: 3100, fieldInpMs: 240, wins: ['Properly size images', 'Eliminate render-blocking resources', 'Reduce unused JavaScript'] }],
    inspection: [
      { url: P('/riverdale-plumber/'), verdict: 'NEUTRAL', coverage: 'Discovered - currently not indexed' },
      { url: P('/'), verdict: 'PASS', coverage: 'Submitted and indexed' },
    ],
  };
}
