import { STOP_WORDS } from './stopwords';
import type { NGram, NlpKeyword, OutlineHeading, SkipGram } from './types';

/**
 * Deterministic planning for the master prompt.
 *
 * Every rule here fixes a conflict a long brief otherwise leaves the model to
 * resolve at random: a word budget too small for the outline, one density
 * target for two different keywords, grouped FAQ headings when each question
 * needs its own, and corpus statistics full of generic words and stray years.
 */

// ── Keywords ────────────────────────────────────────────────────────────────

/** "Six kings Slam, Six Kings Slam Tickets" → ["Six Kings Slam", "Six Kings Slam Tickets"]. */
export function splitKeywords(main: string): string[] {
  const seen = new Set<string>();
  return main
    .split(/[,;|\n]+/)
    .map((k) => k.replace(/\s+/g, ' ').trim())
    .filter((k) => k.length > 1)
    .map(titleCaseLike)
    .filter((k) => {
      const key = k.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Keeps the user's capitals, but fixes an obviously half-capitalised phrase like "Six kings Slam". */
function titleCaseLike(k: string): string {
  const words = k.split(' ');
  const capped = words.filter((w) => /^[A-Z]/.test(w)).length;
  return capped > 0 && capped < words.length && capped >= words.length / 2
    ? words.map((w) => (w.length > 2 || words.indexOf(w) === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ')
    : k;
}

export interface KeywordTarget {
  term: string;
  primary: boolean;
  min: number;
  max: number;
}

/**
 * Exact-match counts rather than a percentage: a model cannot count density as
 * it writes, but it can aim for "10 to 14 times". The primary keyword sits near
 * 1%, secondaries near 0.4%, which keeps the page natural.
 */
export function keywordTargets(keywords: string[], words: number): KeywordTarget[] {
  return keywords.map((term, i) => {
    const primary = i === 0;
    const lo = Math.max(primary ? 4 : 2, Math.round(words * (primary ? 0.004 : 0.0015)));
    const hi = Math.max(lo + 2, Math.round(words * (primary ? 0.006 : 0.0025)));
    return { term, primary, min: lo, max: hi };
  });
}

// ── Length ──────────────────────────────────────────────────────────────────

export interface LengthBudget {
  requested: number;
  /** The least the outline needs to say something useful under every heading. */
  minimum: number;
  /** What the writer is asked for: the larger of the two. */
  effective: number;
  h2: number;
  h3: number;
  perH3: number;
  perH2Intro: number;
  raised: boolean;
}

export const OPENING_WORDS = 150; // key takeaways, definition, last-updated line
const PER_H2_INTRO = 40;
const PER_H3 = 70;
// The least a heading can carry and still be useful: a direct answer plus one
// supporting specific. The requested length is only raised to this floor, so a
// big outline gives tight sections rather than an article twice the size asked.
const MIN_OPENING = 120;
const MIN_PER_H2_INTRO = 30;
const MIN_PER_H3 = 45;

export function lengthBudget(outline: OutlineHeading[], requested: number): LengthBudget {
  const h2 = outline.filter((h) => h.level === 2).length;
  const h3 = outline.filter((h) => h.level >= 3).length;
  const minimum = Math.round((MIN_OPENING + h2 * MIN_PER_H2_INTRO + h3 * MIN_PER_H3) / 50) * 50;
  const effective = Math.max(requested, minimum);
  // Roomy targets get the full intro allowance; tight ones get the floor.
  const roomy = effective >= OPENING_WORDS + h2 * PER_H2_INTRO + h3 * PER_H3;
  const perH2Intro = roomy ? PER_H2_INTRO : MIN_PER_H2_INTRO;
  const opening = roomy ? OPENING_WORDS : MIN_OPENING;
  // Spread what is left over evenly, so a generous target deepens sections
  // instead of growing the introduction.
  const spare = Math.max(0, effective - opening - h2 * perH2Intro);
  const perH3 = h3 ? Math.max(MIN_PER_H3, Math.round(spare / h3 / 5) * 5) : PER_H3;
  return { requested, minimum, effective, h2, h3, perH3, perH2Intro, raised: effective > requested };
}

/** The most headings a word target can carry well, for the outline generator. */
export function maxSectionsFor(words: number): { h2: number; h3: number } {
  const h3 = Math.max(6, Math.floor((words - OPENING_WORDS) / (PER_H3 + 25)));
  return { h2: Math.max(5, Math.min(10, Math.ceil(h3 / 2.5))), h3 };
}

// ── Outline ─────────────────────────────────────────────────────────────────

const FAQ = /\b(faq|faqs|frequently asked|common questions|questions and answers)\b/i;

/**
 * Gives each question its own H3 under the FAQ section. Grouped FAQ headings
 * ("Tickets and entry") cannot hold a question-and-answer pair, which is the
 * shape featured snippets and AI answers lift.
 */
export function withFaqQuestions(outline: OutlineHeading[], questions: string[], max = 8): OutlineHeading[] {
  const qs = questions.map((q) => q.trim()).filter(Boolean).slice(0, max).map((q) => (q.endsWith('?') ? q : `${q}?`));
  if (!qs.length) return outline;
  const start = outline.findIndex((h) => h.level === 2 && FAQ.test(h.text));
  if (start === -1) return outline;
  let end = start + 1;
  while (end < outline.length && outline[end]!.level > 2) end++;
  return [...outline.slice(0, start + 1), ...qs.map((text) => ({ level: 3, text })), ...outline.slice(end)];
}

// ── Corpus statistics ───────────────────────────────────────────────────────

/** Words that are frequent in any article and say nothing about its topic. */
const GENERIC = new Set([
  'first', 'world', 'event', 'events', 'time', 'times', 'every', 'available', 'since', 'receive', 'one', 'also',
  'year', 'years', 'new', 'way', 'day', 'days', 'best', 'well', 'make', 'made', 'get', 'take', 'including',
  'place', 'part', 'number', 'people', 'like', 'just', 'see', 'will', 'can', 'may', 'many', 'much', 'more',
  'most', 'other', 'last', 'next', 'top', 'good', 'great', 'big', 'set', 'per', 'via', 'use', 'used', 'click',
  'read', 'share', 'page', 'site', 'home', 'news', 'menu', 'search', 'login', 'subscribe', 'cookie', 'cookies',
]);

const isNumberish = (w: string) => /^\d+([.,:]\d+)?$/.test(w);

function isTopicalYear(w: string, currentYear: number): boolean {
  const n = Number(w);
  return /^\d{4}$/.test(w) && n >= currentYear - 1 && n <= currentYear + 1;
}

function isNoiseWord(w: string, currentYear: number): boolean {
  const lw = w.toLowerCase();
  if (STOP_WORDS.has(lw) || GENERIC.has(lw)) return true;
  return isNumberish(lw) && !isTopicalYear(lw, currentYear);
}

/**
 * Phrases worth asking for: multi-word phrases first, and a single word only
 * when it is topical and not already inside a kept phrase.
 */
export function usefulPhrases(ngrams: NGram[], currentYear: number, limit = 25): NGram[] {
  const multi = ngrams.filter((g) => g.n > 1 && !g.text.split(' ').every((w) => isNoiseWord(w, currentYear)));
  const covered = new Set(multi.flatMap((g) => g.text.toLowerCase().split(' ')));
  const single = ngrams.filter((g) => g.n === 1 && !isNoiseWord(g.text, currentYear) && !covered.has(g.text.toLowerCase()));
  return [...multi, ...single].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function usefulTerms(keywords: NlpKeyword[], currentYear: number, limit = 30): NlpKeyword[] {
  return keywords.filter((k) => !isNoiseWord(k.term, currentYear)).slice(0, limit);
}

export function usefulPairs(pairs: SkipGram[], currentYear: number, limit = 15): SkipGram[] {
  return pairs
    .filter((p) => {
      const [a = '', b = ''] = p.text.split(/\s*…\s*|\s+/).filter(Boolean);
      return !isNoiseWord(a, currentYear) && !isNoiseWord(b, currentYear) && a.toLowerCase() !== b.toLowerCase();
    })
    .slice(0, limit);
}
