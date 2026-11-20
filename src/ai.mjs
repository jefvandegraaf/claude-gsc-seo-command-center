// Optional: Claude picks the three actions that matter most this week and explains them in plain English.
// It only ranks and explains findings the rules already found (with their numbers). It can't add new ones.
//   ai = 'api'  → Claude API with your own key (ANTHROPIC_API_KEY). Required if other people use your install.
//   ai = 'cli'  → your local Claude Code ("claude -p"), for your own sites on your own computer.
//   ai = 'none' → no AI: the top three by score, with the standard explanations.
import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const Digest = z.object({
  headline: z.string().describe('One sentence, plain English, about how the site did these 28 days.'),
  summary: z.string().describe('Two or three sentences for a busy business owner. No jargon.'),
  actions: z.array(z.object({
    key: z.string().describe('The exact key of the chosen task.'),
    why: z.string().describe('One or two sentences: why this matters for the business this week.'),
  })).max(3),
});

const SYSTEM = `You write the Monday SEO email for a small business website. The reader is the business owner or their marketer, not an SEO expert.
Pick the three tasks that will most likely bring more customers soon, and explain each in plain English.
Rules:
- Use only the tasks and numbers given. Never invent numbers, pages, searches or causes.
- Prefer fixes that are quick and likely to pay off (pages close to page one, titles that underperform, pages that dropped) over big projects.
- If the data is thin (a new site, few impressions), say so honestly and pick foundational tasks.
- No hype, no exclamation marks, no "leverage", "unlock" or "boost". Short sentences.`;

function brief(site, head, tasks, info) {
  return JSON.stringify({
    site: { name: site.name, url: site.url },
    last28DaysVsPrevious28: head,
    openTasks: tasks.slice(0, 12).map((t) => ({ key: t.key, type: t.type, title: t.title, evidence: t.evidence })),
    otherNotes: info.map((i) => `${i.title}: ${i.evidence}`),
  });
}

export function ruleDigest(site, head, tasks) {
  const c = head.clicks;
  const trend = c ? (c.change === null ? 'started getting clicks from Google' : c.change > 5 ? `got ${c.change}% more Google clicks than the 28 days before` : c.change < -5 ? `got ${Math.abs(c.change)}% fewer Google clicks than the 28 days before` : 'held steady on Google') : 'has no Search Console data yet';
  return {
    headline: `${site.name || site.url} ${trend}.`,
    summary: tasks.length ? 'Here are the three tasks most likely to bring in more visitors this week, with the numbers behind each one.' : 'Nothing urgent this week. Keep publishing and check back next Monday.',
    actions: tasks.slice(0, 3).map((t) => ({ key: t.key, why: WHY[t.type] || '' })),
    by: 'rules',
  };
}
const WHY = {
  striking: 'This search already finds you on page one or two. Small improvements here usually pay off faster than writing something new.',
  ctr: 'Google already shows this page high up, but few people click. A better title and description can win more visitors without ranking higher.',
  cannibal: 'Your own pages are competing with each other, so neither ranks as well as one strong page would.',
  decay: 'This page used to bring visitors and is bringing fewer. Catching a drop early is easier than recovering later.',
  prune: 'Pages nobody finds can drag down how Google sees the rest of your site. Improve them, merge them or retire them.',
  index: 'Pages that aren\'t in Google\'s index can\'t bring you any search visitors at all.',
  speed: 'Slow pages lose callers on phones and rank lower. These fixes are usually quick.',
};

function validate(out, tasks) {
  const keys = new Set(tasks.map((t) => t.key));
  const actions = (out.actions || []).filter((a) => keys.has(a.key));
  return actions.length ? { ...out, actions } : null;
}

async function viaApi(site, head, tasks, info, apiKey, model) {
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model: model || 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // if the main model declines, the API retries on a fallback model in the same call
    output_config: { effort: 'medium', format: zodOutputFormat(Digest) },
    system: SYSTEM,
    messages: [{ role: 'user', content: brief(site, head, tasks, info) }],
  });
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = Digest.safeParse(JSON.parse(text));
  return parsed.success ? validate({ ...parsed.data, by: 'claude-api' }, tasks) : null;
}

function viaCli(site, head, tasks, info) {
  const prompt = `${SYSTEM}\n\nReply with JSON only, no other text, in this shape: {"headline": "...", "summary": "...", "actions": [{"key": "...", "why": "..."}]} (max 3 actions).\n\nData:\n${brief(site, head, tasks, info)}`;
  return new Promise((resolve) => {
    let out = '';
    const child = spawn('claude', ['-p', '--output-format', 'json'], { shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 180000);
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(out).result || '';
        const json = result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1);
        const parsed = Digest.safeParse(JSON.parse(json));
        resolve(parsed.success ? validate({ ...parsed.data, by: 'claude-code' }, tasks) : null);
      } catch { resolve(null); }
    });
    child.stdin.end(prompt);
  });
}

export async function writeDigest({ site, head, tasks, info, settings, secrets, log = () => {} }) {
  const fallback = ruleDigest(site, head, tasks);
  if (!tasks.length) return fallback;
  try {
    if (settings.ai === 'api') {
      if (!secrets.anthropicApiKey) { log('AI summary skipped: no Claude API key.'); return fallback; }
      return (await viaApi(site, head, tasks, info, secrets.anthropicApiKey, settings.model)) || fallback;
    }
    if (settings.ai === 'cli') return (await viaCli(site, head, tasks, info)) || fallback;
  } catch (e) {
    log(`AI summary failed, using the standard text (${e.status ? `${e.status} ` : ''}${e.message.split('\n')[0]}).`);
  }
  return fallback;
}
