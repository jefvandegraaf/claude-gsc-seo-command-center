// Findings become tasks that remember their status, so the Monday email never repeats itself
// and finished work gets measured 28 days later.
import { pretty } from './analyse.mjs';

export const STATUSES = ['open', 'done', 'ignored'];
const IMPACT_AFTER_DAYS = 28;

// The copy-paste prompt for Claude Code (or any AI) to fix the finding.
export function fixPrompt(f, site) {
  const page = f.target ? `${f.target}` : site.url;
  switch (f.type) {
    case 'striking':
      return `My page ${page} ranks around position ${f.metrics.position} on Google for "${f.query}" (${f.metrics.impressions} impressions in 28 days). Read the page and help me move it onto page one: 1) does the page fully answer what someone searching "${f.query}" wants? List what's missing. 2) Suggest a better H1, title tag and meta description that include the search naturally. 3) Suggest 2-3 internal links from my other pages with anchor text. Don't stuff keywords and don't invent facts about my business.`;
    case 'ctr':
      return `My page ${page} shows up around position ${f.metrics.position} on Google but only ${(f.metrics.ctr * 100).toFixed(1)}% of people click it.${(f.queries || []).length ? ` Top searches: ${f.queries.map((q) => `"${q}"`).join(', ')}.` : ''} Write 3 alternative title tags (under 60 characters) and 3 meta descriptions (under 155 characters) that give a searcher a clear reason to click, without clickbait or claims I can't back up. Explain which you'd pick and why.`;
    case 'cannibal':
      return `These pages on my site compete for the Google search "${f.query}": ${(f.pages || []).join(', ')} (site: ${site.url}). Read them and recommend ONE: merge them (which one keeps the URL, what moves over, and the 301 redirect to add), or differentiate them (a distinct search intent for each, new titles, and internal links from the weaker page to the stronger one). Tell me which you'd choose and why.`;
    case 'decay':
      return `My page ${page} is losing Google clicks: ${f.evidence.replace(/\.$/, '')}. Help me find out why. Check: is the content out of date, did the title or page change recently, is a competitor now outranking it for the main searches, is it still indexable (no noindex, loads fast, canonical correct)? Then give me a short refresh plan in order of impact.`;
    case 'prune':
      return `These pages on ${site.url} have had zero Google impressions in 90 days, and they're all older than 90 days: ${(f.pages || []).join(', ')}. For each, recommend: improve (and how), merge into another page (which one, plus the 301 redirect), or remove (410 or 301). Keep any page that brings customers from somewhere other than Google, even if Google ignores it. Ask me before deleting anything.`;
    case 'index':
      return `Google Search Console says these pages on ${site.url} aren't indexed: ${(f.pages || []).join('; ')}. For each, explain what that status means in plain English and the fix: check for noindex tags, canonicals pointing elsewhere, thin or duplicate content, missing internal links, and whether it's in the sitemap. Then remind me to use URL Inspection → Request indexing once each page is fixed.`;
    case 'speed':
      return `PageSpeed Insights scores my page ${page} ${f.metrics.speed}/100 on mobile. Biggest wins: ${(f.wins || []).join('; ')}. Fix them one at a time, starting with the largest saving, without changing how the page looks. After each change, tell me what changed so I can re-test.`;
    default:
      return `${f.title}. ${f.evidence}. Page: ${page}`;
  }
}

export const claudeLink = (prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt.slice(0, 1800))}`;

// Metrics for a task's target page in a snapshot (for before/after).
export function targetMetrics(task, snap) {
  const g = snap?.gsc;
  if (!g) return null;
  if (task.type === 'striking' && task.query) {
    const r = g.queryPages.find((x) => x.query === task.query && x.url === task.target) || g.queryPages.find((x) => x.query === task.query);
    return r ? { clicks: r.clicks, impressions: r.impressions, position: r.position, ctr: r.ctr } : { clicks: 0, impressions: 0 };
  }
  if (task.path) {
    const p = g.pages.find((x) => x.path === task.path);
    return p ? { clicks: p.clicks, impressions: p.impressions, position: p.position, ctr: p.ctr } : { clicks: 0, impressions: 0 };
  }
  return null;
}

export function describeImpact(before, after) {
  if (!before || !after) return null;
  const parts = [];
  const d = (k) => (after[k] || 0) - (before[k] || 0);
  const n = (v) => Number(v || 0).toLocaleString('en-US');
  if (before.clicks !== undefined) parts.push(`clicks ${n(before.clicks)} → ${n(after.clicks)} (${d('clicks') >= 0 ? '+' : ''}${n(d('clicks'))})`);
  if (before.ctr) parts.push(`click rate ${(before.ctr * 100).toFixed(1)}% → ${((after.ctr || 0) * 100).toFixed(1)}%`);
  if (before.position) parts.push(`position ${before.position} → ${after.position ?? '–'}`);
  return { text: parts.join(', '), better: d('clicks') > 0 || (before.position && after.position && after.position < before.position - 0.5) };
}

// Merge new findings into the task list.
export function refreshTasks(tasks, findings, site, snap) {
  const list = tasks.map((t) => ({ ...t }));
  const live = new Set(findings.map((f) => f.key));
  for (const f of findings) {
    const t = list.find((x) => x.key === f.key);
    const fields = { title: f.title, evidence: f.evidence, score: Math.round(f.score), metrics: f.metrics || null, prompt: fixPrompt(f, site), lastSeen: snap.takenAt };
    if (t) Object.assign(t, fields, t.status === 'open' ? {} : {});
    else list.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, key: f.key, type: f.type, target: f.target || null, path: f.path || null, query: f.query || null, status: 'open', created: snap.takenAt, ...fields });
  }
  // Open suggestions the numbers no longer support drop off; anything you touched stays.
  const kept = list.filter((t) => t.status !== 'open' || live.has(t.key));
  // Measure finished tasks once, 28+ days after they were marked done.
  for (const t of kept) {
    if (t.status === 'done' && t.doneAt && !t.impact && (new Date(snap.takenAt) - new Date(t.doneAt)) / 864e5 >= IMPACT_AFTER_DAYS) {
      const imp = describeImpact(t.before, targetMetrics(t, snap));
      if (imp) t.impact = { ...imp, measuredAt: snap.takenAt };
    }
  }
  return kept;
}

export function setStatus(tasks, id, status, latestSnap) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status ${status}`);
  return tasks.map((t) => (t.id !== id ? t : {
    ...t, status,
    ...(status === 'done' ? { doneAt: new Date().toISOString(), before: targetMetrics(t, latestSnap) || t.metrics, impact: null } : {}),
    ...(status === 'open' ? { doneAt: null, before: null, impact: null } : {}),
  }));
}

export const openTasks = (tasks) => tasks.filter((t) => t.status === 'open').sort((a, b) => b.score - a.score);
export const recentWins = (tasks, sinceIso) => tasks.filter((t) => t.impact && (!sinceIso || t.impact.measuredAt >= sinceIso));
export const label = (t) => t.title || pretty(t.path);
