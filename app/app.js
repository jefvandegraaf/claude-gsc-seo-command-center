// Renderer. Talks to the app only through window.cc (see preload.cjs). No keys ever reach this file.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let state = null;
let current = null;
let filter = 'open';
let tasks = [];

async function call(fn, ...a) {
  const r = await window.cc[fn](...a);
  if (!r.ok) { log(`⚠ ${r.error}`); throw new Error(r.error); }
  return r.value;
}
function log(m) { const el = $('#log'); el.textContent += `${m}\n`; el.scrollTop = el.scrollHeight; }
window.cc.onLog(log);

function show(view) { for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${view}`; }

async function refreshState() {
  state = await call('state');
  $('#sites').innerHTML = state.sites.map((s) => `<a href="#" data-id="${esc(s.id)}"${s.id === current ? ' aria-current="page"' : ''}>${esc(s.name)}</a>`).join('');
}

// ── Site view ──
async function openSite(id) {
  current = id;
  await refreshState();
  const site = state.sites.find((s) => s.id === id);
  if (!site) return show('welcome');
  show('site');
  $('#site-name').textContent = site.name;
  const latest = await call('latest', id);
  tasks = latest.tasks;
  $('#site-meta').textContent = `${site.url} · ${latest.lastRun ? `last refreshed ${latest.lastRun}` : 'not refreshed yet'} · emails to ${site.recipients.join(', ') || 'nobody yet'}`;
  $('#week-empty').hidden = Boolean(latest.html);
  $('#digest').hidden = !latest.html;
  // Links in the digest open in your browser (target _blank → the app's link handler).
  $('#digest').srcdoc = latest.html.replace('<head>', '<head><base target="_blank">');
  $('#run-send').disabled = !site.recipients.length;
  $('#run-send').title = site.recipients.length ? '' : 'Add recipients in Site setup first';
  renderTasks();
  renderSiteForm(site);
}

function renderTasks() {
  const list = tasks.filter((t) => t.status === filter).sort((a, b) => b.score - a.score);
  $('#task-list').innerHTML = list.length ? list.map((t) => `
    <div class="task" data-id="${esc(t.id)}">
      <h3>${esc(String(t.title).replace(/ (\S{1,16})$/, '\u00a0$1'))}</h3>
      <div class="ev">${esc(t.evidence)}</div>
      ${t.impact ? `<div class="impact${t.impact.better ? ' good' : ''}">After 28 days: ${esc(t.impact.text)}</div>` : t.status === 'done' ? `<div class="impact">Marked done ${esc((t.doneAt || '').slice(0, 10))}. Impact is measured 28 days later.</div>` : ''}
      <details><summary>Fix prompt</summary><pre>${esc(t.prompt)}</pre></details>
      <div class="row">
        <button data-act="copy">Copy prompt</button>
        <button data-act="claude" class="ghost">Open in Claude</button>
        ${t.status === 'open' ? '<button data-act="done" class="ghost">Mark done</button><button data-act="ignored" class="ghost">Ignore</button>' : '<button data-act="open" class="ghost">Reopen</button>'}
      </div>
    </div>`).join('') : `<p class="empty">No ${filter} tasks.</p>`;
}

$('#task-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const t = tasks.find((x) => x.id === btn.closest('.task').dataset.id);
  const act = btn.dataset.act;
  if (act === 'copy') { await call('copy', t.prompt); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy prompt'; }, 1500); return; }
  if (act === 'claude') return call('open', `https://claude.ai/new?q=${encodeURIComponent(t.prompt.slice(0, 1800))}`);
  tasks = await call('setTask', current, t.id, act);
  renderTasks();
});

for (const b of document.querySelectorAll('.filters button')) {
  b.addEventListener('click', () => {
    filter = b.dataset.filter;
    for (const x of document.querySelectorAll('.filters button')) x.setAttribute('aria-pressed', String(x === b));
    renderTasks();
  });
}
for (const b of document.querySelectorAll('.tabs button')) {
  b.addEventListener('click', () => {
    for (const x of document.querySelectorAll('.tabs button')) x.setAttribute('aria-selected', String(x === b));
    for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== `tab-${b.dataset.tab}`;
  });
}

async function doRun(sendEmail) {
  const buttons = [$('#run'), $('#run-send')];
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const r = await call('run', current, sendEmail);
    log(`${r.headline}${r.sent ? ' Email sent.' : ''}${r.errors.length ? ` (couldn't read: ${r.errors.join(' · ')})` : ''}`);
  } catch { /* logged */ }
  await openSite(current);
}
$('#run').addEventListener('click', () => doRun(false));
$('#run-send').addEventListener('click', () => doRun(true));

// ── Site setup form ──
const field = (name, label, value, hint = '', type = 'text') => `<label>${label}${hint ? ` <span class="hint">${hint}</span>` : ''}<input name="${name}" type="${type}" value="${esc(value)}"></label>`;
const joinList = (a) => (a || []).join(', ');
const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function renderSiteForm(site) {
  const s = site || { name: '', url: '', gscProperty: '', ga4PropertyId: '', fathomSiteId: '', recipients: [], hideQueries: [], psiPages: ['/'], conversions: { fathomEvents: [], ga4Events: [] }, brand: { name: '', logoUrl: '', color: '#111111', replyTo: '' } };
  $('#site-form').innerHTML = `
    <div class="two">${field('name', 'Site name', s.name)}${field('url', 'Website address', s.url, 'https://…', 'url')}</div>
    <label>Search Console property <span class="hint">exactly as in Search Console, e.g. sc-domain:example.com or https://example.com/</span>
      <input name="gscProperty" value="${esc(s.gscProperty)}" list="gsc-list"><datalist id="gsc-list"></datalist></label>
    <button type="button" class="ghost" id="load-props">List the properties my service account can read</button>
    <div class="two">${field('ga4PropertyId', 'GA4 property ID (optional)', s.ga4PropertyId, 'numbers only')}${field('fathomSiteId', 'Fathom site ID (optional)', s.fathomSiteId)}</div>
    <div class="two">${field('ga4Events', 'GA4 lead events', joinList(s.conversions?.ga4Events), 'comma separated, e.g. generate_lead')}${field('fathomEvents', 'Fathom lead events', joinList(s.conversions?.fathomEvents), 'e.g. form_submit, phone_click')}</div>
    ${field('recipients', 'Who gets the Monday email', joinList(s.recipients), 'comma separated')}
    ${field('psiPages', 'Pages to speed-test', joinList(s.psiPages), 'paths, e.g. /, /contact/ (max 3)')}
    ${field('hideQueries', 'Never show searches containing', joinList(s.hideQueries), 'e.g. a private person\'s name')}
    <h2>Branding (for agencies and freelancers)</h2>
    <div class="two">${field('brandName', 'Your business name on the email', s.brand?.name)}${field('replyTo', 'Reply-to address', s.brand?.replyTo, '', 'email')}</div>
    <div class="two">${field('logoUrl', 'Logo image URL', s.brand?.logoUrl, 'https://…png')}${field('color', 'Button colour', s.brand?.color || '#111111', '', 'color')}</div>
    <label class="check"><input type="checkbox" name="credit"${s.brand?.credit === false ? '' : ' checked'}> Show the small "Made with" credit line</label>
    <label class="check"><input type="checkbox" name="paused"${s.paused ? ' checked' : ''}> Pause the weekly email for this site</label>
    <div class="actions"><button type="submit">Save site</button>${site ? '<button type="button" class="ghost" id="remove-site">Remove site</button>' : ''}</div>`;
  $('#load-props').addEventListener('click', async () => {
    try { const props = await call('properties'); $('#gsc-list').innerHTML = props.map((p) => `<option value="${esc(p)}">`).join(''); log(props.length ? `Your service account can read: ${props.join(', ')}` : 'Your service account can\'t read any Search Console property yet. Add its email as a user on the property.'); } catch { /* logged */ }
  });
  $('#remove-site')?.addEventListener('click', async () => {
    if (!confirm(`Remove ${s.name}? Its history stays in the data folder.`)) return;
    await call('removeSite', s.id); current = null; await refreshState(); show('welcome');
  });
}

$('#site-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const existing = state.sites.find((s) => s.id === current);
  const site = await call('saveSite', {
    ...(existing ? { id: existing.id } : {}),
    name: f.get('name'), url: f.get('url'), gscProperty: f.get('gscProperty'), ga4PropertyId: f.get('ga4PropertyId'), fathomSiteId: f.get('fathomSiteId'),
    conversions: { ga4Events: splitList(f.get('ga4Events')), fathomEvents: splitList(f.get('fathomEvents')) },
    recipients: splitList(f.get('recipients')), psiPages: splitList(f.get('psiPages')).slice(0, 3), hideQueries: splitList(f.get('hideQueries')),
    brand: { name: f.get('brandName'), replyTo: f.get('replyTo'), logoUrl: f.get('logoUrl'), color: f.get('color'), credit: f.get('credit') === 'on' },
    paused: f.get('paused') === 'on',
  });
  log(`Saved ${site.name}.`);
  await openSite(site.id);
});

// ── Settings ──
async function openSettings() {
  current = null;
  await refreshState();
  show('settings');
  const s = state.secrets;
  const keyRow = (name) => `<div class="key"><div><strong>${esc(state.secretNames[name])}</strong><div class="state${s[name] ? ' on' : ''}">${s[name] ? 'Set' : 'Not set'}${name === 'googleServiceAccount' && state.serviceAccount ? `: ${esc(state.serviceAccount)}` : ''}</div></div>
    <div class="ctrl">${name === 'googleServiceAccount' ? '<button data-sa class="ghost">Choose key file…</button>' : `<input type="password" data-key="${name}" placeholder="Paste to ${s[name] ? 'replace' : 'set'}" autocomplete="off">`}${s[name] ? `<button class="ghost" data-clear="${name}">Remove</button>` : ''}</div></div>`;
  $('#keys').innerHTML = `<h2>Keys</h2>${state.encryption ? '' : '<p class="meta">⚠ This computer has no keychain encryption, so keys can\'t be stored here. Use the command line with environment variables instead.</p>'}${Object.keys(state.secretNames).map(keyRow).join('')}<p class="meta">Press Enter to save a pasted key.</p>`;
  const st = state.settings;
  $('#settings-form').innerHTML = `
    <h2>Email and schedule</h2>
    <label>Send from <span class="hint">an address on a domain you verified in Resend, e.g. SEO Reports &lt;reports@yourdomain.com&gt;</span><input name="from" value="${esc(st.from)}"></label>
    <div class="two">
      <label>Day<select name="day">${DAYS.map((d, i) => `<option value="${i}"${i === st.schedule.day ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Time<select name="hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === st.schedule.hour ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></label>
    </div>
    <label>AI summaries
      <select name="ai">
        <option value="none"${st.ai === 'none' ? ' selected' : ''}>Off: rules only (free)</option>
        <option value="api"${st.ai === 'api' ? ' selected' : ''}>Claude API (your own API key, pay per use)</option>
        <option value="cli"${st.ai === 'cli' ? ' selected' : ''}>Claude Code on this computer (your own sites only)</option>
      </select><span class="hint">Claude only picks and explains the week's top three from findings the rules already made. It can't invent new ones.</span></label>
    <label class="check"><input type="checkbox" name="runInBackground"${st.runInBackground ? ' checked' : ''}> Keep running in the tray when I close the window (needed for Monday emails)</label>
    <label class="check"><input type="checkbox" name="openAtLogin"${st.openAtLogin ? ' checked' : ''}> Start when I log in to my computer</label>
    <div class="actions"><button type="submit">Save settings</button></div>`;
  $('#data-dir').textContent = `Your data folder: ${state.dataDir}`;
}

$('#keys').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter' || !e.target.dataset.key) return;
  try { await call('setSecret', e.target.dataset.key, e.target.value); e.target.value = ''; log('Key saved.'); await openSettings(); } catch { /* logged */ }
});
$('#keys').addEventListener('click', async (e) => {
  if (e.target.dataset.sa !== undefined) { try { const email = await call('importServiceAccount'); if (email) log(`Service account saved: ${email}. Add this email as a user on your Search Console property (and as a Viewer in GA4).`); await openSettings(); } catch { /* logged */ } }
  if (e.target.dataset.clear) { await call('clearSecret', e.target.dataset.clear); await openSettings(); }
});
$('#settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await call('saveSettings', { from: f.get('from'), ai: f.get('ai'), schedule: { day: Number(f.get('day')), hour: Number(f.get('hour')) }, runInBackground: f.get('runInBackground') === 'on', openAtLogin: f.get('openAtLogin') === 'on' });
  log('Settings saved.');
});

// ── Rail ──
$('#sites').addEventListener('click', (e) => { const a = e.target.closest('a[data-id]'); if (a) { e.preventDefault(); openSite(a.dataset.id); } });
$('#add-site').addEventListener('click', () => {
  current = null; show('site');
  $('#site-name').textContent = 'Add a site'; $('#site-meta').textContent = '';
  renderSiteForm(null);
  document.querySelector('.tabs [data-tab="setup"]').click();
});
$('#try-demo').addEventListener('click', async () => { log('Running the demo with made-up data…'); const id = await call('demo'); await openSite(id); });
$('#open-settings').addEventListener('click', openSettings);

refreshState().then(() => { if (state.sites[0]) openSite(state.sites[0].id); else show('welcome'); });
