// Desktop app: setup, the weekly digest, tasks, and the Monday scheduler (runs while the app is open,
// including minimised to the tray). For emails while the computer sleeps, see docs/always-on.md.
import { app, BrowserWindow, ipcMain, safeStorage, dialog, shell, clipboard, Tray, Menu, nativeImage, Notification } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import {
  dataDir, loadSites, upsertSite, removeSite, getSite, loadSettings, saveSettings, loadTasks, saveTasks,
  listSnapshots, loadSnapshot, digestPath,
} from '../src/store.mjs';
import { SECRET_NAMES, secretStatus } from '../src/secrets.mjs';
import { runSite, isDue } from '../src/run.mjs';
import { setStatus } from '../src/tasks.mjs';
import { googleToken, gscProperties, serviceAccountEmail } from '../src/sources.mjs';
import { DEMO_SITE, demoSnapshot } from '../src/demo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let win = null;
let tray = null;
let quitting = false;
const running = new Set();

// ── Encrypted key vault (OS keychain via safeStorage) ──
const vaultPath = () => join(dataDir(), 'secrets.enc.json');
function readVault() {
  if (!existsSync(vaultPath())) return {};
  const raw = JSON.parse(readFileSync(vaultPath(), 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(raw)) { try { out[k] = safeStorage.decryptString(Buffer.from(v, 'base64')); } catch { /* unreadable on this machine */ } }
  return out;
}
function writeVault(secrets) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('This computer has no keychain encryption available, so keys can\'t be stored safely. Use the command line with environment variables instead.');
  const enc = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v).map(([k, v]) => [k, safeStorage.encryptString(v).toString('base64')]));
  writeFileSync(vaultPath(), JSON.stringify(enc, null, 2));
}
const secrets = () => ({ googleServiceAccount: '', anthropicApiKey: '', resendApiKey: '', fathomApiToken: '', psiApiKey: '', ...readVault() });

// ── Links: only these open in the browser ──
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*(claude\.ai|github\.com|google\.com|resend\.com|usefathom\.com|jefvandegraaf\.com|anthropic\.com|cloud\.google\.com|developers\.google\.com)(\/|$)/i;
const openSafe = (url) => { if (ALLOWED.test(url)) shell.openExternal(url); };

const send = (ch, msg) => { if (win && !win.isDestroyed()) win.webContents.send(ch, msg); };
const log = (m) => send('log', `${new Date().toLocaleTimeString()}  ${m}`);

async function run(siteId, { sendEmail = false } = {}) {
  const site = getSite(siteId);
  if (!site) throw new Error('Site not found.');
  if (running.has(siteId)) throw new Error('Already running.');
  running.add(siteId);
  try {
    const r = await runSite(site, secrets(), { send: sendEmail, log, snapshot: site.id === DEMO_SITE.id ? demoSnapshot() : null });
    return { headline: r.digest.headline, errors: r.errors, sent: Boolean(r.sent) };
  } finally { running.delete(siteId); }
}

// ── Scheduler: checks every 10 minutes while the app is open ──
async function tick() {
  const settings = loadSettings();
  for (const site of loadSites()) {
    if (site.id === DEMO_SITE.id || running.has(site.id) || !isDue(site, settings)) continue;
    try {
      await run(site.id, { sendEmail: true });
      new Notification({ title: 'Weekly SEO email sent', body: `${site.name} → ${site.recipients.join(', ')}` }).show();
    } catch (e) {
      log(`${site.name}: ${e.message}`);
      new Notification({ title: `Couldn't send ${site.name}'s email`, body: e.message }).show();
    }
  }
}

// A tiny solid-colour PNG for the tray icon (no image files needed).
function trayIcon() {
  const size = 16, row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) row.set([0x1f, 0x4e, 0x79, 0xff], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const crc = (buf) => { let c, crcv = 0xffffffff; for (const b of buf) { c = (crcv ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcv = (crcv >>> 8) ^ c; } return (crcv ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return nativeImage.createFromBuffer(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

function createWindow(show = true) {
  win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 900, minHeight: 600, show, title: 'SEO Command Center', backgroundColor: '#ffffff',
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(join(here, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { openSafe(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); openSafe(url); } });
  win.on('close', (e) => {
    if (!quitting && loadSettings().runInBackground) { e.preventDefault(); win.hide(); }
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(() => {
  const settings = loadSettings();
  app.setLoginItemSettings({ openAtLogin: Boolean(settings.openAtLogin), args: ['--hidden'] });
  createWindow(!process.argv.includes('--hidden'));
  tray = new Tray(trayIcon());
  tray.setToolTip('SEO Command Center');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open SEO Command Center', click: () => { win.show(); win.focus(); } },
    { label: 'Quit (weekly emails stop until you reopen it)', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { win.show(); win.focus(); });
  setTimeout(tick, 30000);
  setInterval(tick, 10 * 60 * 1000);
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (!loadSettings().runInBackground) app.quit(); });

// ── IPC (the renderer never sees a key, only whether it's set) ──
const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => {
  try { return { ok: true, value: await fn(...a) }; } catch (e) { return { ok: false, error: e.message }; }
});

handle('state', () => {
  const s = secrets();
  return { sites: loadSites(), settings: loadSettings(), secrets: secretStatus(s), secretNames: SECRET_NAMES, serviceAccount: serviceAccountEmail(s.googleServiceAccount), dataDir: dataDir(), encryption: safeStorage.isEncryptionAvailable() };
});
handle('site:save', (site) => upsertSite(site));
handle('site:remove', (id) => removeSite(id));
handle('site:run', (id, sendEmail) => run(id, { sendEmail: Boolean(sendEmail) }));
handle('site:latest', (id) => {
  const snaps = listSnapshots(id).filter((s) => !s.endsWith('.digest'));
  const last = snaps[snaps.length - 1];
  const meta = last ? loadSnapshot(id, `${last}.digest`) : null;
  return { html: existsSync(digestPath(id)) ? readFileSync(digestPath(id), 'utf8') : '', tasks: loadTasks(id), lastRun: last || null, meta };
});
handle('task:status', (siteId, taskId, status) => {
  const snaps = listSnapshots(siteId).filter((s) => !s.endsWith('.digest'));
  const latest = snaps.length ? loadSnapshot(siteId, snaps[snaps.length - 1]) : null;
  const tasks = setStatus(loadTasks(siteId), taskId, status, latest);
  saveTasks(siteId, tasks);
  return tasks;
});
handle('settings:save', (s) => {
  saveSettings(s);
  app.setLoginItemSettings({ openAtLogin: Boolean(loadSettings().openAtLogin), args: ['--hidden'] });
  return loadSettings();
});
handle('secret:set', (name, value) => {
  if (!(name in SECRET_NAMES)) throw new Error('Unknown key.');
  writeVault({ ...readVault(), [name]: String(value || '').trim() });
  return secretStatus(secrets());
});
handle('secret:clear', (name) => { const v = readVault(); delete v[name]; writeVault(v); return secretStatus(secrets()); });
handle('secret:importServiceAccount', async () => {
  const pick = await dialog.showOpenDialog(win, { title: 'Choose your Google service account key (.json)', filters: [{ name: 'JSON key', extensions: ['json'] }], properties: ['openFile'] });
  if (pick.canceled || !pick.filePaths[0]) return null;
  const text = readFileSync(pick.filePaths[0], 'utf8');
  const j = JSON.parse(text);
  if (j.type !== 'service_account' || !j.private_key || !j.client_email) throw new Error('That file isn\'t a Google service account key.');
  writeVault({ ...readVault(), googleServiceAccount: text });
  return j.client_email;
});
handle('google:properties', async () => gscProperties(await googleToken(secrets().googleServiceAccount)));
handle('demo', async () => { upsertSite(DEMO_SITE); await run(DEMO_SITE.id); return DEMO_SITE.id; });
handle('open', (url) => openSafe(url));
handle('copy', (text) => clipboard.writeText(String(text)));
