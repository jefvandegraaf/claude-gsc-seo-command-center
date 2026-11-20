// The Monday digest: one email-safe HTML document (tables + inline styles, no scripts, no SVG), plus a plain-text version.
// The same HTML is what the desktop app shows as "This week".
import { claudeLink } from './tasks.mjs';
import { reportData } from './report.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Join the last two words so no line ends with one word on its own.
export const tie = (s) => String(s ?? '').replace(/ (\S{1,16})$/, ' $1');
const fmt = (v) => Number(v || 0).toLocaleString('en-US');
const FONT = "Inter,-apple-system,'Segoe UI',Arial,sans-serif";
const INK = '#111111', META = '#6b6b6b', LINE = '#e7e6e2', TINT = '#f1f0ec', PAGE = '#f7f7f5', UP = '#1f8a4c', DOWN = '#a3170f', HERO = '#101010';

function pctChange(cur, prev) {
  if (!prev && !cur) return { text: 'No change', color: META };
  if (!prev) return { text: 'New', color: UP };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (!pct) return { text: 'No change', color: META };
  return { text: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%`, color: pct > 0 ? UP : DOWN };
}
function tile(label, v, width) {
  const d = pctChange(v.cur || 0, v.prev || 0);
  return `<td width="${width}%" style="padding:6px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:14px 14px 12px;font-family:${FONT}">
<div style="font-size:26px;font-weight:600;color:${INK};line-height:1.2">${fmt(v.cur)}</div>
<div style="font-size:13px;color:${META};padding-top:2px">${esc(tie(label))}</div>
<div style="font-size:13px;font-weight:600;color:${d.color};padding-top:6px">${d.text}</div>
</td></tr></table></td>`;
}
function tiles(list) {
  const rows = [];
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2)); // two across stays readable on a phone
  return rows.map((r) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${r.map(([l, v]) => tile(l, v, 50)).join('')}${r.length < 2 ? '<td width="50%"></td>' : ''}</tr></table>`).join('');
}
const p = (t, s = '') => `<p style="margin:0 0 12px;font:400 15px/1.55 ${FONT};color:${INK};${s}">${t}</p>`;
const h2 = (t) => `<h2 style="margin:32px 0 10px;padding:0;font:600 20px/1.25 ${FONT};color:${INK}">${esc(tie(t))}</h2>`;
const h3 = (t) => `<h3 style="margin:22px 0 6px;padding:0;font:600 15px/1.3 ${FONT};color:${INK}">${esc(tie(t))}</h3>`;
const small = (t) => `<p style="margin:10px 0 0;font:400 12px/1.5 ${FONT};color:${META}">${t}</p>`;
const button = (href, text, color) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 4px"><tr><td style="background:${color};border-radius:10px"><a href="${esc(href)}" style="display:inline-block;padding:12px 18px;font:600 14px/1 ${FONT};color:#ffffff;text-decoration:none">${esc(text)}</a></td></tr></table>`;
function table(head, rows, align = []) {
  const cell = (v, i, th) => `<${th ? 'th' : 'td'} align="${align[i] || 'left'}" style="padding:8px 6px;font:${th ? 600 : 400} 12px/1.35 ${FONT};color:${INK};border-top:1px solid ${LINE};${th ? `background:${TINT};border-top:0;` : ''}${i ? 'white-space:nowrap;' : 'word-break:break-word;'}">${v}</${th ? 'th' : 'td'}>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${`<tr>${head.map((v, i) => cell(esc(v), i, true)).join('')}</tr>`}${rows.map((r) => `<tr>${r.map((v, i) => cell(v, i)).join('')}</tr>`).join('')}</table>`;
}

// Bars drawn with table cells, so they survive every email client.
function weekChart(weeks, color) {
  const max = Math.max(...weeks.map((w) => w.clicks), 1);
  const H = 96;
  const label = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const bars = weeks.map((w, i) => {
    const h = Math.max(4, Math.round((w.clicks / max) * H));
    const last = i === weeks.length - 1;
    return `<td valign="bottom" align="center" style="padding:0 3px;font-family:${FONT}">
<div style="font-size:10px;color:${last ? INK : META};font-weight:${last ? 600 : 400};padding-bottom:3px">${fmt(w.clicks)}</div>
<div style="height:${h}px;background:${last ? color : '#c9c7c0'};border-radius:4px 4px 0 0;font-size:0;line-height:0">&nbsp;</div></td>`;
  }).join('');
  const labels = weeks.map((w) => `<td align="center" style="padding:5px 3px 0;font:400 10px/1.2 ${FONT};color:${META}">${label(w.week)}</td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr style="height:${H + 18}px">${bars}</tr><tr>${labels}</tr></table>`;
}

export function digestSubject(site, digest) {
  return `This week for ${site.name || site.url}: ${digest.actions.length ? `${digest.actions.length} thing${digest.actions.length > 1 ? 's' : ''} to fix` : 'all clear'}`;
}

export function digestHtml({ site, head, digest, tasks, info, wins, snap }) {
  const brand = site.brand || {};
  const color = /^#[0-9a-f]{6}$/i.test(brand.color || '') ? brand.color : INK;
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const actions = digest.actions.map((a) => ({ ...a, task: byKey.get(a.key) })).filter((a) => a.task);
  const chosen = new Set(actions.map((a) => a.key));
  const later = tasks.filter((t) => t.status === 'open' && !chosen.has(t.key)).slice(0, 4);
  const week = new Date(snap.takenAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const domain = String(site.url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
  const r = reportData(snap);
  const body = [];

  body.push(p(esc(tie(digest.summary))));
  const list = [];
  if (head.visitors) list.push([head.visitors.label || 'Website visitors', head.visitors]);
  if (head.leads) list.push(['Leads (calls, forms, bookings)', head.leads]);
  if (head.clicks) list.push(['Clicks from Google', head.clicks]);
  if (head.impressions) list.push(['Times seen on Google', head.impressions]);
  if (head.ai && (head.ai.cur || head.ai.prev)) list.push(['Visitors from AI tools', head.ai]);
  body.push(`<div style="margin:0 -6px">${tiles(list)}</div>`);

  // ── Leads by type ──
  const total = r.mix.reduce((t, m) => t + m.cur, 0);
  if (total) {
    body.push(h2('Where your leads came from'));
    body.push(p(`${fmt(total)} people reached out in the last 28 days.`));
    body.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:5px;overflow:hidden"><tr>${r.mix.filter((m) => m.cur).map((m) => `<td width="${Math.max(4, Math.round((m.cur / total) * 100))}%" height="10" style="background:${m.color};font-size:0;line-height:0">&nbsp;</td>`).join('')}</tr></table>`);
    body.push(`<p style="margin:8px 0 0;font:400 13px/1.8 ${FONT};color:${INK}">${r.mix.map((m) => { const d = pctChange(m.cur, m.prev); return `<span style="white-space:nowrap;margin-right:14px"><span style="color:${m.color}">■</span> ${esc(m.label)}: ${fmt(m.cur)} <span style="color:${d.color};font-weight:600">${d.text}</span></span>`; }).join(' ')}</p>`);
  }

  // ── Google, week by week ──
  if (r.weeks.length >= 3) {
    body.push(h2('Clicks from Google, week by week'));
    body.push(weekChart(r.weeks, color));
  }

  // ── This week's tasks ──
  if (actions.length) body.push(h2(`This week's ${actions.length === 1 ? 'task' : `${actions.length} tasks`}`));
  actions.forEach((a, i) => body.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:16px 18px;font-family:${FONT}">
<div style="font:600 12px ${FONT};color:${META};text-transform:uppercase;letter-spacing:.04em">Task ${i + 1} of ${actions.length}</div>
<div style="font:600 17px/1.35 ${FONT};color:${INK};padding:6px 0 8px">${esc(tie(a.task.title))}</div>
${p(esc(tie(a.why)), 'margin-bottom:6px')}
<p style="margin:0;font:400 13px/1.5 ${FONT};color:${META}">${esc(a.task.evidence)}</p>
${button(claudeLink(a.task.prompt), 'Open the fix prompt in Claude', color)}
<p style="margin:8px 0 6px;font:400 12px/1.5 ${FONT};color:${META}">Or paste it into Claude Code in your website's folder:</p>
<div style="padding:10px 12px;background:${TINT};border-radius:8px;font:400 12px/1.5 Consolas,Menlo,monospace;color:${INK};word-break:break-word">${esc(tie(a.task.prompt))}</div>
</td></tr></table>`));

  // ── Wins ──
  if (wins.length) {
    body.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px;background:${TINT};border-radius:12px"><tr><td style="padding:18px 20px;font-family:${FONT}">
<div style="font-size:18px;font-weight:600;color:${INK};padding-bottom:8px">What your earlier fixes did</div>
${wins.map((t) => `<p style="margin:0 0 10px;font:400 15px/1.5 ${FONT};color:${INK}"><strong style="font-weight:600">${esc(t.title)}</strong><br><span style="color:${t.impact.better ? UP : META};font-weight:600">${esc(t.impact.text)}</span><span style="color:${META};font-size:13px"> · 28 days after you marked it done</span></p>`).join('')}
</td></tr></table>`);
  }

  // ── How people found you ──
  if (r.topPages.length || r.topQueries.length) {
    body.push(h2('How people found you on Google'));
    if (r.topQueries.length) { body.push(h3('Top searches')); body.push(table(['Search', 'Clicks'], r.topQueries.map((q) => [esc(q.query), fmt(q.clicks)]), ['left', 'right'])); }
    if (r.rising.length) { body.push(h3('Growing searches')); body.push(table(['Search', 'More clicks'], r.rising.map((q) => [esc(q.query), `<span style="color:${UP};font-weight:600">+${fmt(q.change)}</span>`]), ['left', 'right'])); }
    if (r.topPages.length) { body.push(h3('Top pages')); body.push(table(['Page', 'Clicks'], r.topPages.map((x) => [esc(x.path), fmt(x.clicks)]), ['left', 'right'])); }
    const dev = [['mobile', 'Phone'], ['desktop', 'Desktop'], ['tablet', 'Tablet']];
    if (dev.some(([k]) => r.devices[k])) {
      body.push(h3('What people searched on'));
      body.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${dev.map(([k, l]) => `<td width="33%" align="center" style="padding:8px;font-family:${FONT}"><div style="font-size:20px;font-weight:600;color:${INK}">${fmt(r.devices[k])}</div><div style="font-size:13px;color:${META}">${l}</div></td>`).join('')}</tr></table>`);
    }
  }
  if (r.ai.length) {
    body.push(h2('Visitors from AI tools'));
    body.push(table(['Came from', 'Visitors'], r.ai.map((x) => [esc(x.source), fmt(x.visits)]), ['left', 'right']));
  }

  // ── The rest ──
  if (later.length || info.length) body.push(h2('Also worth knowing'));
  for (const t of later) body.push(p(`• ${esc(t.title)} <span style="color:${META};font-size:13px">(${esc(tie(t.evidence))})</span>`, 'font-size:14px;margin-bottom:8px'));
  for (const x of info) body.push(p(`• <strong style="font-weight:600">${esc(x.title)}:</strong> ${esc(x.evidence)}`, 'font-size:14px;margin-bottom:8px'));
  if (snap.errors.length) body.push(small(`Couldn't read: ${esc(snap.errors.join(' · '))}`));
  body.push(small('Mark tasks done (or ignore them) in your SEO Command Center, so next week\'s email moves on and measures what changed. Google numbers come from Search Console and the last few days can shift slightly.'));

  const sender = brand.name || 'SEO Command Center';
  const logo = brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="" width="32" height="32" style="display:inline-block;vertical-align:middle;margin-right:8px;border-radius:8px">` : '';
  const footer = [
    brand.replyTo ? `Questions? Reply to this email or write to <a href="mailto:${esc(brand.replyTo)}" style="color:${INK}">${esc(brand.replyTo)}</a>.` : 'Questions? Reply to this email.',
    `<strong style="font-weight:600">${esc(sender)}</strong>`,
    brand.credit === false ? '' : `<span style="font-size:12px;color:${META}">Made with the free <a href="https://github.com/jefvandegraaf/claude-gsc-seo-command-center" style="color:${META}">Claude GSC SEO Command Center</a> by Jef van de Graaf.</span>`,
  ].filter(Boolean).join('<br><br>');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(digestSubject(site, digest))}</title><style>@media (max-width:480px){.r-title{font-size:24px!important}.r-sub{font-size:14px!important}}</style></head>
<body style="margin:0;padding:0;background:${PAGE}">
<div style="display:none;max-height:0;overflow:hidden">${esc(digest.headline)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
<tr><td style="padding:18px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font:600 16px/1.2 ${FONT};color:${INK}">${logo}${esc(sender)}</td>
<td align="right" style="font:400 13px/1.35 ${FONT};color:${META}">Weekly SEO report<br>${esc(week)}</td></tr></table></td></tr>
<tr><td style="background:${HERO};padding:32px 16px"><div style="font-family:${FONT}">
<div class="r-title" style="font-size:28px;line-height:1.2;font-weight:600;color:#ffffff">${esc(tie(digest.headline))}</div>
<div class="r-sub" style="font-size:15px;line-height:1.5;color:rgba(255,255,255,.85);padding-top:10px">How ${domain ? `<a href="${esc(site.url)}" style="color:#ffffff;text-decoration:underline">${esc(domain)}</a>` : esc(site.name)} did in the last 28 days, compared to the 28&nbsp;before.</div>
</div></td></tr>
<tr><td style="padding:24px 16px">${body.join('\n')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid ${LINE}"><tr><td style="padding-top:16px;font:400 15px/1.5 ${FONT};color:${INK}">${footer}</td></tr></table>
</td></tr></table></td></tr></table></body></html>`;
}

export function digestText({ site, head, digest, tasks, wins }) {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const lines = [digest.headline, '', digest.summary, ''];
  for (const [k, l] of [['visitors', 'Visitors'], ['leads', 'Leads'], ['clicks', 'Clicks from Google'], ['impressions', 'Times seen on Google'], ['ai', 'Visitors from AI tools']]) {
    if (head[k]) lines.push(`${l}: ${fmt(head[k].cur)} (${head[k].change === null ? 'new' : `${head[k].change >= 0 ? '+' : ''}${head[k].change}%`})`);
  }
  digest.actions.forEach((a, i) => {
    const t = byKey.get(a.key);
    if (t) lines.push('', `${i + 1}. ${t.title}`, a.why, t.evidence, '', `Fix prompt: ${t.prompt}`);
  });
  if (wins.length) lines.push('', 'What your earlier fixes did:', ...wins.map((t) => `- ${t.title}: ${t.impact.text}`));
  lines.push('', `${site.url}`);
  return lines.join('\n');
}

export async function sendEmail({ apiKey, from, to, subject, html, text, replyTo }) {
  if (!apiKey) throw new Error('No Resend API key.');
  if (!from) throw new Error('No "from" address. Set one in Settings (a domain you verified in Resend).');
  if (!to?.length) throw new Error('No recipients for this site.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${j.message || 'unknown error'}`);
  return j.id;
}
