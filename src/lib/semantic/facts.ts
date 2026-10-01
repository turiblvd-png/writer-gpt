import { randomUUID } from 'node:crypto';
import { complete } from '@/lib/ai';
import { extractJson } from '@/lib/content/json';
import type { RunClock } from '@/lib/pipeline/types';
import { systemPreamble } from '@/lib/style/rules';
import { safeDomain } from './url';
import type { FactSheet, FactStatus, SemanticProject, VerifiedFact } from './types';

/**
 * The fact sheet: the only place the writer may take a specific from.
 *
 * Two inputs, kept apart so the article can be honest about each:
 * - a live Google Search brief (Gemini with grounding), whose facts are
 *   "confirmed" when a current source states them;
 * - the competitor pages the user added, whose claims are "reported" with the
 *   page's real URL, since one ranking page saying it does not make it true.
 * Disagreements are kept as "conflicting" and gaps as "unconfirmed", which the
 * article states openly. That is the trust gap the ranking pages leave.
 */

const STATUSES: FactStatus[] = ['confirmed', 'reported', 'conflicting', 'unconfirmed'];

export function factResearchPrompt(project: SemanticProject, clock: RunClock): string {
  return [
    systemPreamble(clock, project.language),
    '',
    `Research "${project.mainKeyword}" against live search, as of ${clock.today}.`,
    '',
    'List the specific facts a reader needs, each on its own line, as:',
    'FACT: <what it is about> | <the value> | <source site or publication> | CONFIRMED or UNCONFIRMED',
    '',
    'Cover, where they apply: what it is (one-sentence definition), current or next dates and times with the time zone, venue or location,',
    'who is involved, prices with currency, where to buy or how to access it, rules or format, prizes or costs, how to watch or use it,',
    'past results or history, and what has not been announced yet.',
    `Prefer official sources. Mark a fact UNCONFIRMED when no current source states it for ${clock.year}.`,
    'If sources disagree, write both values on one line separated by " vs " and name both sources.',
    'No prose, no commentary, only FACT lines.',
  ].join('\n');
}

function structurePrompt(project: SemanticProject, research: string, pages: { url: string; text: string }[], clock: RunClock, live: boolean): string {
  return [
    `It is ${clock.today}. Build a fact sheet for an article on "${project.mainKeyword}".`,
    '',
    live ? 'LIVE SEARCH BRIEF (current sources):' : 'RESEARCH NOTES (no live search was available; nothing here is confirmed):',
    research.slice(0, 12000) || '(none)',
    '',
    'COMPETITOR PAGES (what ranking pages claim; each block starts with its URL):',
    ...pages.map((p) => `--- ${p.url}\n${p.text.slice(0, 5000)}`),
    '',
    'Return JSON only:',
    '{ "facts": [ { "label": "", "value": "", "status": "confirmed|reported|conflicting|unconfirmed", "source": "", "url": "" } ],',
    '  "sources": [ { "name": "", "url": "" } ] }',
    '',
    'Rules:',
    live
      ? '- "confirmed": stated by the live search brief. "source" names the site or publication it came from.'
      : '- Never use "confirmed": live search was unavailable.',
    '- "reported": stated only by a competitor page. "url" must be that page\'s URL exactly as given above.',
    '- "conflicting": sources give different values. Put both in "value" and both sources in "source".',
    '- "unconfirmed": a detail readers will look for that no source states (for example not yet announced).',
    '- One fact per item, specific and checkable: dates, times, places, names, prices, numbers, rules.',
    '- Do not add anything that is not in the material above.',
    '- "sources": the sites and pages the article may cite, official sources first. Use URLs only if they appear above.',
    '- 10 to 30 facts.',
  ].join('\n');
}

function clean(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Turns the model's JSON into a fact sheet, dropping anything malformed or invented. */
export function parseFactSheet(raw: string, competitorUrls: string[], live: boolean): FactSheet {
  const data = extractJson<{ facts?: unknown[]; sources?: unknown[] }>(raw);
  const known = new Set(competitorUrls);
  const facts: VerifiedFact[] = [];
  for (const item of Array.isArray(data.facts) ? data.facts : []) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const label = clean(f.label, 120);
    const value = clean(f.value);
    if (!label || !value) continue;
    let status = STATUSES.includes(f.status as FactStatus) ? (f.status as FactStatus) : 'unconfirmed';
    if (!live && status === 'confirmed') status = 'reported';
    let url = clean(f.url, 500);
    // A URL the model did not get from the material is a fabricated citation.
    if (url && !known.has(url)) url = '';
    if (status === 'reported' && !url) status = 'unconfirmed';
    facts.push({ id: randomUUID(), label, value, status, source: clean(f.source, 160) || (url ? safeDomain(url) : undefined), url: url || undefined });
  }
  const sources: FactSheet['sources'] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(data.sources) ? data.sources : []) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const url = clean(s.url, 500);
    const name = clean(s.name, 160) || (url ? safeDomain(url) : '');
    const safeUrl = url && known.has(url) ? url : undefined;
    const key = (safeUrl ?? name).toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    sources.push({ name, url: safeUrl });
  }
  // Every competitor page actually used for a fact is citable.
  for (const f of facts) {
    if (f.url && !seen.has(f.url.toLowerCase())) {
      seen.add(f.url.toLowerCase());
      sources.push({ name: f.source || safeDomain(f.url), url: f.url });
    }
  }
  return { facts, sources, liveSearch: live, researchedAt: Date.now() };
}

/** Researches and structures the fact sheet for a project. */
export async function buildFactSheet(project: SemanticProject, clock: RunClock): Promise<FactSheet> {
  let research = '';
  let live = false;
  try {
    const res = await complete('research', { prompt: factResearchPrompt(project, clock), grounded: true, temperature: 0.2 });
    research = res.text;
    // Only Gemini searches the web here; a stand-in answered from memory.
    live = res.provider === 'gemini' && (res.sources.length > 0 || /FACT:/i.test(res.text));
    if (live && res.sources.length) {
      const names = res.sources.map((s) => s.title || s.domain).filter(Boolean).slice(0, 12);
      research += `\n\nSources consulted: ${names.join(', ')}`;
    }
  } catch {
    // No research provider at all: build from the competitor pages alone.
  }

  const pages = project.data.competitorContent.filter((c) => !c.error && c.text).map((c) => ({ url: c.url, text: c.text }));
  const res = await complete('structure', { prompt: structurePrompt(project, research, pages, clock, live), json: true, temperature: 0.1 });
  return parseFactSheet(res.text, pages.map((p) => p.url), live);
}

export { factSheetBlock } from './fact-block';
