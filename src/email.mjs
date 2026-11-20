// The Monday digest: one email-safe HTML document (tables + inline styles, no scripts), plus a plain-text version.
// The same HTML is what the desktop app shows as "This week".
import { claudeLink } from './tasks.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Join the last two words so no line ends with one word on its own.
export const tie = (s) => String(s ?? '').replace(/ (\S{1,16})$/, '\u00a0$1');
const fmt = (v) => Number(v || 0).toLocaleString('en-US');
const FONT = "Inter,-apple-system,'Segoe UI',Arial,sans-serif";
const INK = '#111111', META = '#6b6b6b', LINE = '#e7e6e2', TINT = '#f6f5f2', UP = '#1f7a45', DOWN = '#a3170f';

function delta(v) {
  if (!v) return { text: '', color: META };
  if (v.change === null) return { text: 'New', color: UP };
  if (!v.change) return { text: 'No change', color: META };
  return { text: `${v.change > 0 ? '↑' : '↓'} ${Math.abs(v.change)}%`, color: v.change > 0 ? UP : DOWN };
}
function tile(label, v) {
  const d = delta(v);
  return `<td width="50%" style="padding:5px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px"><tr><td style="padding:12px 14px;font-family:${FONT}">
<div style="font-size:24px;font-weight:600;color:${INK};line-height:1.2">${fmt(v.cur)}</div>
<div style="font-size:13px;color:${META};padding-top:2px">${esc(label)}</div>
<div style="font-size:13px;font-weight:600;color:${d.color};padding-top:4px">${d.text}</div></td></tr></table></td>`;
}
const p = (t, s = '') => `<p style="margin:0 0 12px;font:400 15px/1.55 ${FONT};color:${INK};${s}">${t}</p>`;
const h2 = (t) => `<h2 style="margin:28px 0 10px;font:600 19px/1.3 ${FONT};color:${INK}">${esc(tie(t))}</h2>`;
const small = (t) => `<p style="margin:6px 0 0;font:400 13px/1.5 ${FONT};color:${META}">${t}</p>`;
const button = (href, text, color) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 4px"><tr><td style="background:${color};border-radius:8px"><a href="${esc(href)}" style="display:inline-block;padding:11px 18px;font:600 14px/1 ${FONT};color:#ffffff;text-decoration:none">${esc(text)}</a></td></tr></table>`;

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

  const tiles = [];
  if (head.clicks) tiles.push(['Clicks from Google', head.clicks]);
  if (head.impressions) tiles.push(['Times seen on Google', head.impressions]);
  if (head.visitors) tiles.push([head.visitors.label || 'Website visitors', head.visitors]);
  if (head.leads) tiles.push(['Leads (forms, calls, bookings)', head.leads]);
  if (head.ai && (head.ai.cur || head.ai.prev)) tiles.push(['Visitors from AI tools', head.ai]);
  const tileRows = [];
  for (let i = 0; i < tiles.length; i += 2) tileRows.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${tiles.slice(i, i + 2).map(([l, v]) => tile(l, v)).join('')}${tiles.length - i === 1 ? '<td width="50%"></td>' : ''}</tr></table>`);

  const body = [
    brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name || '')}" height="32" style="display:block;height:32px;width:auto;margin:0 0 18px">` : (brand.name ? `<div style="font:600 14px ${FONT};color:${META};margin-bottom:18px">${esc(brand.name)}</div>` : ''),
    `<div style="font:400 13px ${FONT};color:${META}">${esc(site.name || site.url)} · week of ${esc(week)} · last 28 days vs the 28 before</div>`,
    `<h1 style="margin:8px 0 12px;font:600 24px/1.25 ${FONT};color:${INK}">${esc(tie(digest.headline))}</h1>`,
    p(esc(tie(digest.summary))),
    tileRows.join(''),
    actions.length ? h2(`This week's ${actions.length === 1 ? 'task' : `${actions.length} tasks`}`) : '',
    ...actions.map((a, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:16px 18px;font-family:${FONT}">
<div style="font:600 13px ${FONT};color:${META}">${i + 1} of ${actions.length}</div>
<div style="font:600 16px/1.35 ${FONT};color:${INK};padding:4px 0 8px">${esc(tie(a.task.title))}</div>
${p(esc(tie(a.why)), 'margin-bottom:6px')}
${small(esc(a.task.evidence))}
${button(claudeLink(a.task.prompt), 'Open the fix prompt in Claude', color)}
${small('Or copy it into Claude Code in your website\'s folder:')}
<div style="margin-top:6px;padding:10px 12px;background:${TINT};border-radius:8px;font:400 12px/1.5 Consolas,Menlo,monospace;color:${INK};word-break:break-word">${esc(a.task.prompt)}</div>
</td></tr></table>`),
    wins.length ? h2('What your earlier fixes did') : '',
    ...wins.map((t) => p(`${t.impact.better ? '✅' : '➖'} <strong>${esc(t.title)}</strong><br><span style="color:${META};font-size:14px">${esc(t.impact.text)} (28 days after you marked it done)</span>`)),
    (later.length || info.length) ? h2('Also worth knowing') : '',
    ...later.map((t) => p(`• ${esc(t.title)} <span style="color:${META};font-size:13px">(${esc(t.evidence)})</span>`, 'font-size:14px;margin-bottom:8px')),
    ...info.map((x) => p(`• <strong>${esc(x.title)}:</strong> ${esc(x.evidence)}`, 'font-size:14px;margin-bottom:8px')),
    snap.errors.length ? small(`Couldn't read: ${esc(snap.errors.join(' · '))}`) : '',
    `<hr style="border:0;border-top:1px solid ${LINE};margin:28px 0 14px">`,
    small('Mark tasks done (or ignore them) in your SEO Command Center, so next week\'s email moves on and measures what changed.'),
    brand.replyTo ? small(`Questions? Reply to this email or write to <a href="mailto:${esc(brand.replyTo)}" style="color:${META}">${esc(brand.replyTo)}</a>.`) : '',
    brand.credit === false ? '' : small('Made with the free <a href="https://github.com/jefvandegraaf/claude-gsc-seo-command-center" style="color:' + META + '">Claude GSC SEO Command Center</a> by Jef van de Graaf.'),
  ].filter(Boolean).join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(digestSubject(site, digest))}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="display:none;max-height:0;overflow:hidden">${esc(digest.summary)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px"><tr><td>${body}</td></tr></table>
</td></tr></table></body></html>`;
}

export function digestText({ site, head, digest, tasks, wins }) {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const lines = [digest.headline, '', digest.summary, ''];
  for (const [k, l] of [['clicks', 'Clicks from Google'], ['impressions', 'Times seen on Google'], ['visitors', 'Visitors'], ['leads', 'Leads'], ['ai', 'Visitors from AI tools']]) {
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
