// One full run for one site: collect → analyse → update tasks → write the digest → (optionally) email it.
import { writeFileSync } from 'node:fs';
import { collect } from './collect.mjs';
import { analyse, headline } from './analyse.mjs';
import { refreshTasks, openTasks, recentWins } from './tasks.mjs';
import { writeDigest } from './ai.mjs';
import { digestHtml, digestText, digestSubject, sendEmail } from './email.mjs';
import {
  loadSettings, writeJson, snapshotPath, loadTasks, saveTasks, loadState, saveState, digestPath, listSnapshots,
} from './store.mjs';

export const isoWeek = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - yearStart) / 864e5 + 1) / 7)).padStart(2, '0')}`;
};

export async function runSite(site, secrets, { send = false, now = new Date(), log = () => {}, snapshot = null } = {}) {
  const settings = loadSettings();
  log(`${site.name}: collecting data…`);
  const snap = snapshot || await collect(site, secrets, { now, log: (m) => log(`${site.name}: ${m}`) });
  const date = snap.takenAt.slice(0, 10);
  writeJson(snapshotPath(site.id, date), snap);

  // Remember when each URL was first seen, so page age is known even without sitemap dates.
  const state = loadState(site.id);
  for (const u of [...(snap.sitemap || []).map((p) => p.url), ...(snap.gsc?.pages90 || []).map((p) => p.url)]) {
    if (!state.firstSeen[u]) state.firstSeen[u] = date;
  }

  const { findings, info } = analyse(snap, state);
  const head = headline(snap);
  const prevRun = state.lastRun;
  const tasks = refreshTasks(loadTasks(site.id), findings, site, snap);
  saveTasks(site.id, tasks);
  const open = openTasks(tasks);
  const wins = recentWins(tasks, prevRun);

  log(`${site.name}: ${findings.length} findings, ${open.length} open tasks. Writing the digest…`);
  const digest = await writeDigest({ site, head, tasks: open, info, settings, secrets, log: (m) => log(`${site.name}: ${m}`) });
  const html = digestHtml({ site, head, digest, tasks, info, wins, snap });
  writeFileSync(digestPath(site.id), html);
  writeJson(snapshotPath(site.id, date).replace(/\.json$/, '.digest.json'), { digest, head, info, subject: digestSubject(site, digest) });

  let sent = null;
  if (send) {
    const subject = digestSubject(site, digest);
    sent = await sendEmail({
      apiKey: secrets.resendApiKey, from: settings.from, to: site.recipients, subject, html,
      text: digestText({ site, head, digest, tasks, wins }), replyTo: site.brand?.replyTo,
    });
    state.lastSentWeek = isoWeek(now);
    log(`${site.name}: emailed ${site.recipients.join(', ')}.`);
  }
  state.lastRun = snap.takenAt;
  saveState(site.id, state);
  return { snap, head, digest, findings, info, tasks, html, sent, errors: snap.errors, snapshots: listSnapshots(site.id).length };
}

// Should this site's Monday email go out now? (Used by the app's scheduler and `cli.mjs scheduled`.)
export function isDue(site, settings, now = new Date()) {
  if (site.paused || !site.recipients?.length) return false;
  const sch = site.schedule || settings.schedule;
  const state = loadState(site.id);
  if (state.lastSentWeek === isoWeek(now)) return false;
  // ISO days (Mon=1 … Sun=7). If the computer was off on Monday, it catches up later that week.
  const today = now.getDay() || 7, target = sch.day || 7;
  return today > target || (today === target && now.getHours() >= sch.hour);
}
