#!/usr/bin/env node
// Command line for the SEO Command Center. The desktop app uses the same core.
// Keys come from environment variables here (see .env.example); never from files in this repo.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  dataDir, loadSites, upsertSite, removeSite, getSite, loadSettings, saveSettings, loadTasks, saveTasks,
  listSnapshots, loadSnapshot, digestPath, siteDir,
} from './src/store.mjs';
import { secretsFromEnv, secretStatus } from './src/secrets.mjs';
import { runSite, isDue } from './src/run.mjs';
import { setStatus, openTasks, claudeLink } from './src/tasks.mjs';
import { googleToken, gscProperties, serviceAccountEmail } from './src/sources.mjs';
import { DEMO_SITE, demoSnapshot } from './src/demo.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const args = rest.filter((a) => !a.startsWith('--'));
const log = (m) => console.log(m);
const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

const HELP = `SEO Command Center

  node cli.mjs demo                         See it work with made-up data (no keys needed)
  node cli.mjs check                        Which keys are set, and which Search Console properties the service account can read
  node cli.mjs add --name="Northline" --url=https://example.com --gsc=sc-domain:example.com [--ga4=123456789] [--fathom=ABCDEF]
                   [--to=you@example.com,team@example.com] [--fathom-events=form_submit,phone_click] [--ga4-events=generate_lead]
                   [--hide=private name] [--brand-name="Your Agency"] [--logo=https://…/logo.png] [--color=#1F4E79] [--reply-to=you@agency.com]
  node cli.mjs sites                        List sites
  node cli.mjs run <site-id> [--send]       Pull data, update tasks, write the digest (and email it with --send)
  node cli.mjs scheduled                    Run + send every site whose weekly email is due (for Task Scheduler / cron)
  node cli.mjs tasks <site-id>              Open tasks with their fix prompts
  node cli.mjs done <site-id> <task-id>     Mark a task done (its impact is measured 28 days later)
  node cli.mjs ignore <site-id> <task-id>   Stop suggesting a task
  node cli.mjs reopen <site-id> <task-id>
  node cli.mjs remove <site-id>
  node cli.mjs settings [--from="Reports <reports@yourdomain.com>"] [--ai=none|api|cli] [--day=1] [--hour=8]

Data folder: ${dataDir()}`;

async function main() {
  const secrets = secretsFromEnv();
  const settings = loadSettings();
  switch (cmd) {
    case 'demo': {
      upsertSite(DEMO_SITE);
      const r = await runSite(DEMO_SITE, secrets, { snapshot: demoSnapshot(), log });
      const out = join(siteDir(DEMO_SITE.id), 'latest-digest.html');
      log(`\n${r.digest.headline}\n`);
      for (const a of r.digest.actions) log(`• ${r.tasks.find((t) => t.key === a.key)?.title}`);
      log(`\nOpen tasks: ${openTasks(r.tasks).length}. The digest email is at:\n${out}`);
      return 0;
    }
    case 'check': {
      const st = secretStatus(secrets);
      for (const [k, v] of Object.entries(st)) log(`${v ? '✓' : '·'} ${k}`);
      log(`AI summaries: ${settings.ai}${settings.ai === 'api' && !st.anthropicApiKey ? ' (no ANTHROPIC_API_KEY set, so it will use the standard text)' : ''}`);
      log(`From address: ${settings.from || '(not set: node cli.mjs settings --from="Reports <reports@yourdomain.com>")'}`);
      if (secrets.googleServiceAccount) {
        log(`\nService account: ${serviceAccountEmail(secrets.googleServiceAccount)}`);
        try { const props = await gscProperties(await googleToken(secrets.googleServiceAccount)); log(props.length ? `Search Console properties it can read:\n  ${props.join('\n  ')}` : 'It can\'t read any Search Console property yet. Add its email as a user (Restricted is enough).'); } catch (e) { log(`✗ ${e.message}`); }
      }
      return 0;
    }
    case 'add': {
      if (!flags.name || !flags.url) { log('Need at least --name and --url.'); return 2; }
      const site = upsertSite({
        ...(flags.id ? { id: flags.id } : {}), name: flags.name, url: flags.url, gscProperty: flags.gsc || '', ga4PropertyId: flags.ga4 || '', fathomSiteId: flags.fathom || '',
        recipients: list(flags.to), hideQueries: list(flags.hide),
        conversions: { fathomEvents: list(flags['fathom-events']), ga4Events: list(flags['ga4-events']) },
        brand: { name: flags['brand-name'] || '', logoUrl: flags.logo || '', color: flags.color || '#111111', replyTo: flags['reply-to'] || '' },
      });
      log(`Saved "${site.name}" as ${site.id}. Try: node cli.mjs run ${site.id}`);
      return 0;
    }
    case 'sites': {
      const sites = loadSites();
      if (!sites.length) log('No sites yet. Add one with: node cli.mjs add --name=… --url=… --gsc=…');
      for (const s of sites) log(`${s.id}  ${s.name}  ${s.url}  → ${s.recipients.join(', ') || '(no recipients)'}${s.paused ? '  [paused]' : ''}`);
      return 0;
    }
    case 'run': {
      const site = getSite(args[0]);
      if (!site) { log(`No site "${args[0]}". See: node cli.mjs sites`); return 2; }
      const r = await runSite(site, secrets, { send: Boolean(flags.send), log, snapshot: site.id === DEMO_SITE.id ? demoSnapshot() : null });
      if (r.errors.length) log(`\nCouldn't read: ${r.errors.join(' · ')}`);
      log(`\n${r.digest.headline}\nDigest: ${digestPath(site.id)}`);
      return 0;
    }
    case 'scheduled': {
      let failed = 0;
      for (const site of loadSites()) {
        if (!isDue(site, settings)) continue;
        try { await runSite(site, secrets, { send: true, log }); } catch (e) { failed++; log(`${site.name}: ${e.message}`); }
      }
      return failed ? 1 : 0;
    }
    case 'tasks': {
      const tasks = openTasks(loadTasks(args[0]));
      if (!tasks.length) log('No open tasks.');
      for (const t of tasks) log(`\n[${t.id}] ${t.title}\n  ${t.evidence}\n  Prompt: ${t.prompt}\n  Open in Claude: ${claudeLink(t.prompt)}`);
      return 0;
    }
    case 'done': case 'ignore': case 'reopen': {
      const [siteId, taskId] = args;
      const snaps = listSnapshots(siteId);
      const latest = snaps.length ? loadSnapshot(siteId, snaps.filter((s) => !s.endsWith('.digest')).pop()) : null;
      saveTasks(siteId, setStatus(loadTasks(siteId), taskId, cmd === 'done' ? 'done' : cmd === 'ignore' ? 'ignored' : 'open', latest));
      log(`Task ${taskId}: ${cmd === 'done' ? 'done. Its impact gets measured 28 days from now.' : cmd === 'ignore' ? 'ignored.' : 'reopened.'}`);
      return 0;
    }
    case 'remove': removeSite(args[0]); log(`Removed ${args[0]} (its history stays in the data folder).`); return 0;
    case 'settings': {
      const next = {};
      if (flags.from) next.from = flags.from;
      if (flags.ai) next.ai = flags.ai;
      if (flags.day || flags.hour) next.schedule = { day: Number(flags.day ?? settings.schedule.day), hour: Number(flags.hour ?? settings.schedule.hour) };
      if (Object.keys(next).length) saveSettings(next);
      log(JSON.stringify(loadSettings(), null, 2));
      return 0;
    }
    default:
      log(HELP);
      return cmd ? 2 : 0;
  }
}

process.exitCode = await main();
