// End-to-end check without any keys: demo data → findings → tasks → digest → mark done → impact 30 days later.
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

process.env.SEO_CC_DATA = mkdtempSync(join(tmpdir(), 'seocc-test-'));
const { upsertSite, loadTasks, saveTasks, digestPath, saveSettings } = await import('../src/store.mjs');
const { runSite, isDue, isoWeek } = await import('../src/run.mjs');
const { setStatus } = await import('../src/tasks.mjs');
const { DEMO_SITE, demoSnapshot } = await import('../src/demo.mjs');

try {
  saveSettings({ ai: 'none' });
  const site = upsertSite(DEMO_SITE);
  const t0 = new Date('2026-11-16T09:00:00Z');
  const r = await runSite(site, {}, { snapshot: demoSnapshot(t0), now: t0 });
  const types = new Set(r.findings.map((f) => f.type));
  for (const t of ['striking', 'ctr', 'cannibal', 'decay', 'prune', 'index', 'speed']) assert.ok(types.has(t), `missing finding type ${t}`);
  assert.equal(r.digest.actions.length, 3);
  const html = readFileSync(digestPath(site.id), 'utf8');
  assert.match(html, /claude\.ai\/new\?q=/);
  assert.doesNotMatch(html, /undefined|NaN/);
  assert.doesNotMatch(html, /\d\.\. /, 'a number lost its last digit');
  // The young page must not be suggested for pruning.
  assert.ok(!r.findings.find((f) => f.type === 'prune').pages.includes('/riverdale-plumber/'));

  // Mark the striking-distance task done, then run 30 days later with better numbers.
  const task = loadTasks(site.id).find((t) => t.key === 'striking:water heater replacement toronto');
  saveTasks(site.id, setStatus(loadTasks(site.id), task.id, 'done', r.snap));
  const t1 = new Date('2026-12-16T09:00:00Z');
  const later = demoSnapshot(t1);
  const q = later.gsc.queryPages.find((x) => x.query === 'water heater replacement toronto');
  Object.assign(q, { clicks: 1340, position: 4.6, ctr: 0.0353 });
  const after = loadTasks(site.id).map((t) => (t.id === task.id ? { ...t, doneAt: '2026-11-16T09:00:00Z' } : t));
  saveTasks(site.id, after);
  const r2 = await runSite(site, {}, { snapshot: later, now: t1 });
  const measured = r2.tasks.find((t) => t.id === task.id);
  assert.ok(measured.impact?.better, 'impact should be measured and positive');
  assert.match(measured.impact.text, /clicks 980 → 1,340/);

  // Scheduler: due on Monday 08:00+, not twice in a week, catches up later in the week.
  const s = { ...site, recipients: ['a@example.com'] };
  const settings = { schedule: { day: 1, hour: 8 } };
  assert.equal(isDue(s, settings, new Date(2026, 10, 23, 7)), false);
  assert.equal(isDue(s, settings, new Date(2026, 10, 23, 9)), true);
  assert.equal(isDue(s, settings, new Date(2026, 10, 25, 9)), true);
  assert.ok(isoWeek(new Date(2026, 10, 23)));
  console.log('✓ smoke test passed: findings, digest, prune age rule, 28-day impact, scheduler');
} finally {
  rmSync(process.env.SEO_CC_DATA, { recursive: true, force: true });
}
