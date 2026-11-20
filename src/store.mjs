// Where everything lives on disk. One folder per install, outside the repo:
//   Windows: %APPDATA%\seo-command-center   macOS: ~/Library/Application Support/seo-command-center   Linux: ~/.config/seo-command-center
// Override with SEO_CC_DATA. Nothing here is ever committed.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

export function dataDir() {
  if (process.env.SEO_CC_DATA) return process.env.SEO_CC_DATA;
  const base = platform() === 'win32' ? (process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'))
    : platform() === 'darwin' ? join(homedir(), 'Library', 'Application Support')
      : (process.env.XDG_CONFIG_HOME || join(homedir(), '.config'));
  return join(base, 'seo-command-center');
}

const ensure = (dir) => { mkdirSync(dir, { recursive: true }); return dir; };
export const siteDir = (id) => ensure(join(dataDir(), 'sites', id));

export function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
// Write to a temp file then rename, so a crash never leaves half a file.
export function writeJson(path, value) {
  ensure(join(path, '..'));
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2));
  renameSync(`${path}.tmp`, path);
}

// ── settings + sites ──
const settingsPath = () => join(ensure(dataDir()), 'settings.json');
export const DEFAULT_SETTINGS = {
  from: '',                // "SEO Command Center <reports@yourdomain.com>" (a domain verified in Resend)
  ai: 'none',              // 'api' (Claude API key), 'cli' (local Claude Code, personal use) or 'none' (rules only)
  model: 'claude-opus-5-5',
  schedule: { day: 1, hour: 8 }, // Monday 08:00 local time
  runInBackground: true,
  openAtLogin: false,
};
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...readJson(settingsPath(), {}) });
export const saveSettings = (s) => writeJson(settingsPath(), { ...loadSettings(), ...s });

const sitesPath = () => join(ensure(dataDir()), 'sites.json');
export const loadSites = () => readJson(sitesPath(), []);
export const saveSites = (sites) => writeJson(sitesPath(), sites);
export const getSite = (id) => loadSites().find((s) => s.id === id);

export const SITE_DEFAULTS = {
  name: '', url: '',
  gscProperty: '',        // "sc-domain:example.com" or "https://example.com/"
  ga4PropertyId: '',      // numbers only, e.g. "312345678"
  fathomSiteId: '',
  conversions: { fathomEvents: [], ga4Events: [] }, // event names that count as a lead
  recipients: [],
  hideQueries: [],         // searches never shown in reports (a private person's name, for example)
  psiPages: ['/'],
  brand: { name: '', logoUrl: '', color: '#111111', replyTo: '' }, // agencies: your name and logo on the email
  schedule: null,          // null = use the global schedule
  paused: false,
};
export function upsertSite(site) {
  const sites = loadSites();
  const id = site.id || slug(site.name || site.url) || `site-${Date.now()}`;
  const merged = { ...SITE_DEFAULTS, ...(sites.find((s) => s.id === id) || {}), ...site, id };
  saveSites([...sites.filter((s) => s.id !== id), merged].sort((a, b) => a.name.localeCompare(b.name)));
  return merged;
}
export const removeSite = (id) => saveSites(loadSites().filter((s) => s.id !== id));
export const slug = (s) => String(s || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// ── per-site history ──
export const snapshotPath = (id, date) => join(siteDir(id), 'snapshots', `${date}.json`);
export function listSnapshots(id) {
  const dir = join(siteDir(id), 'snapshots');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => f.slice(0, -5));
}
export const loadSnapshot = (id, date) => readJson(snapshotPath(id, date), null);
export const tasksPath = (id) => join(siteDir(id), 'tasks.json');
export const loadTasks = (id) => readJson(tasksPath(id), []);
export const saveTasks = (id, tasks) => writeJson(tasksPath(id), tasks);
export const statePath = (id) => join(siteDir(id), 'state.json');
export const loadState = (id) => readJson(statePath(id), { firstSeen: {}, lastRun: null, lastSentWeek: null });
export const saveState = (id, s) => writeJson(statePath(id), s);
export const digestPath = (id) => join(siteDir(id), 'latest-digest.html');
