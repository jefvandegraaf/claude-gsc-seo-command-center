// Demo data for a fictional business, so anyone can see the command center work before connecting Google.
// Northline Plumbing is not real. Every number here is made up.
import { windows } from './collect.mjs';

export const DEMO_SITE = {
  id: 'demo-northline-plumbing', name: 'Northline Plumbing (demo)', url: 'https://northlineplumbing.example/',
  gscProperty: 'sc-domain:northlineplumbing.example', recipients: [], psiPages: ['/'],
  brand: { name: 'Demo Agency', logoUrl: '', color: '#1F4E79', replyTo: '' }, conversions: { fathomEvents: ['form_submit', 'phone_click'], ga4Events: [] },
};

const P = (path) => `https://northlineplumbing.example${path}`;
const row = (path, clicks, impressions, position, query) => ({ ...(query ? { query } : {}), url: P(path), path, clicks, impressions, position, ctr: impressions ? +(clicks / impressions).toFixed(4) : 0 });

export function demoSnapshot(now = new Date()) {
  const w = windows(now);
  const pages = [
    row('/', 310, 5200, 3.1), row('/water-heater-replacement/', 96, 4100, 6.2), row('/drain-cleaning/', 141, 2600, 4.4),
    row('/emergency-plumber-toronto/', 22, 3900, 2.7), row('/galvanized-pipe-replacement/', 18, 1500, 11.8),
    row('/blog/why-is-my-water-heater-leaking/', 40, 2900, 8.9), row('/blog/water-heater-leaking-from-top/', 12, 1700, 9.6),
    row('/about/', 25, 400, 2.0), row('/contact/', 31, 380, 1.9), row('/leslieville-plumber/', 9, 650, 14.2),
  ];
  const prevPages = [
    row('/', 295, 4900, 3.3), row('/water-heater-replacement/', 101, 3800, 6.5), row('/drain-cleaning/', 230, 2700, 3.1),
    row('/emergency-plumber-toronto/', 20, 3600, 2.9), row('/galvanized-pipe-replacement/', 15, 1300, 12.4),
    row('/blog/why-is-my-water-heater-leaking/', 44, 2800, 8.7), row('/blog/water-heater-leaking-from-top/', 10, 1500, 10.1),
    row('/about/', 22, 390, 2.1), row('/contact/', 28, 350, 2.0), row('/leslieville-plumber/', 6, 500, 15.0), row('/blog/sump-pump-guide/', 19, 700, 7.0),
  ];
  const queryPages = [
    row('/water-heater-replacement/', 31, 1900, 7.4, 'water heater replacement toronto'),
    row('/water-heater-replacement/', 12, 800, 9.1, 'tankless water heater cost'),
    row('/galvanized-pipe-replacement/', 9, 900, 11.2, 'galvanized pipe replacement cost'),
    row('/emergency-plumber-toronto/', 14, 2400, 2.5, 'emergency plumber toronto'),
    row('/drain-cleaning/', 70, 1200, 4.0, 'drain cleaning toronto'),
    row('/blog/why-is-my-water-heater-leaking/', 21, 1400, 9.3, 'water heater leaking'),
    row('/blog/water-heater-leaking-from-top/', 7, 1100, 10.4, 'water heater leaking'),
    row('/leslieville-plumber/', 6, 420, 13.6, 'plumber leslieville'),
    row('/', 180, 1600, 1.4, 'northline plumbing'),
    row('/', 20, 900, 6.8, 'plumber east toronto'),
    row('/blog/why-is-my-water-heater-leaking/', 4, 260, 12.0, 'hot water tank leaking from bottom'),
  ];
  const prevQueries = queryPages.filter((q) => q.query !== 'tankless water heater cost' && q.query !== 'hot water tank leaking from bottom').map(({ query, clicks, impressions, position }) => ({ query, clicks, impressions, position }));
  const pages90 = [...pages, row('/blog/sump-pump-guide/', 40, 1500, 7.2)];
  const old = new Date(now); old.setUTCFullYear(old.getUTCFullYear() - 1);
  const recent = new Date(now); recent.setUTCDate(recent.getUTCDate() - 20);
  const sitemap = [
    ...pages90.map((p) => ({ url: p.url, lastmod: old.toISOString().slice(0, 10) })),
    { url: P('/blog/plumbing-tips-2021/'), lastmod: '2021-06-01' },
    { url: P('/blog/our-new-van/'), lastmod: '2022-03-14' },
    { url: P('/services/old-landing-page/'), lastmod: '2023-01-09' },
    { url: P('/riverdale-plumber/'), lastmod: recent.toISOString().slice(0, 10) },
  ];
  return {
    site: DEMO_SITE.id, url: DEMO_SITE.url, takenAt: now.toISOString(), windows: w, errors: [], demo: true,
    sources: { gsc: true, sitemap: true, fathom: true, speed: true, inspection: true },
    gsc: { pages, prevPages, pages90, queryPages, prevQueries, daily: [] },
    sitemap,
    fathom: { visits: 1840, prevVisits: 1755, conversions: 47, prevConversions: 41, aiVisits: 23, prevAiVisits: 11, aiSources: [{ source: 'chatgpt.com', visits: 15 }, { source: 'perplexity.ai', visits: 8 }] },
    speed: [{ url: P('/'), strategy: 'mobile', score: 38, lcp: '5.9 s', cls: '0.21', tbt: '640 ms', fieldLcpMs: null, fieldInpMs: null, wins: ['Properly size images', 'Eliminate render-blocking resources', 'Reduce unused JavaScript'] }],
    inspection: [
      { url: P('/riverdale-plumber/'), verdict: 'NEUTRAL', coverage: 'Discovered - currently not indexed' },
      { url: P('/'), verdict: 'PASS', coverage: 'Submitted and indexed' },
    ],
  };
}
