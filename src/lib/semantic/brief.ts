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
 * it writes, but it can aim for "10 to 14 times". Counted in body text only:
 * headings come from the outline, and a keyword in them is placement, not
 * stuffing. The primary keyword sits around 0.5 to 0.9%, secondaries around
 * 0.15 to 0.35%, which reads naturally.
 */
export function keywordTargets(keywords: string[], words: number): KeywordTarget[] {
  return keywords.map((term, i) => {
    const primary = i === 0;
    const lo = Math.max(primary ? 4 : 2, Math.round(words * (primary ? 0.005 : 0.0015)));
    const hi = Math.max(lo + 2, Math.round(words * (primary ? 0.009 : 0.0035)));
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
  /** Words directly under each outline heading, aligned with the outline. */
  weights: number[];
  /** Words for the opening: definition, last-updated line and key takeaways. */
  opening: number;
  /** Typical budgets, for the brief's summary line. */
  perSection: number;
  perH3: number;
  perH2Intro: number;
  raised: boolean;
}

export const OPENING_WORDS = 130;
/** A section with no subheadings: a direct answer, then the specifics that matter. */
const SECTION_WORDS = 130;
/** A few more words for each point folded into a section from a dropped subheading. */
const PER_COVER = 10;
const MAX_COVER_BONUS = 40;
const H2_INTRO_WORDS = 40;
const H3_WORDS = 100;
const FAQ_INTRO = 15;
const FAQ_ANSWER = 45;
const SOURCES_WORDS = 40;
/** One heading per this many words reads as an article, not a list of fragments. */
export const WORDS_PER_HEADING = 220;

const FAQ = /\b(faq|faqs|frequently asked|common questions|questions and answers)\b/i;
const SOURCES = /^\s*(sources?|references|further reading)\b/i;

type Kind = 'h1' | 'section' | 'intro' | 'h3' | 'faq' | 'faq-q' | 'sources';

/** What each heading is, from its level, its parent and its wording. */
function kinds(outline: OutlineHeading[]): Kind[] {
  let parent: 'content' | 'faq' | 'sources' | null = null;
  return outline.map((h, i) => {
    if (h.level <= 1) return 'h1';
    if (h.level === 2) {
      parent = FAQ.test(h.text) ? 'faq' : SOURCES.test(h.text) ? 'sources' : 'content';
      if (parent !== 'content') return parent;
      return (outline[i + 1]?.level ?? 0) > 2 ? 'intro' : 'section';
    }
    return parent === 'faq' ? 'faq-q' : 'h3';
  });
}

/**
 * The word budget, worked out heading by heading. Short FAQ answers and the
 * Sources list do not inflate it; real sections get room for an answer and its
 * specifics. The requested length is only raised to what the outline needs.
 */
export function lengthBudget(outline: OutlineHeading[], requested: number): LengthBudget {
  const k = kinds(outline);
  const base = outline.map((h, i) => {
    switch (k[i]) {
      case 'section': return SECTION_WORDS + Math.min(MAX_COVER_BONUS, (h.covers?.length ?? 0) * PER_COVER);
      case 'intro': return H2_INTRO_WORDS;
      case 'h3': return H3_WORDS + Math.min(MAX_COVER_BONUS, (h.covers?.length ?? 0) * PER_COVER);
      case 'faq': return FAQ_INTRO;
      case 'faq-q': return FAQ_ANSWER;
      case 'sources': return SOURCES_WORDS;
      default: return 0;
    }
  });
  const growable = (i: number) => k[i] === 'section' || k[i] === 'intro' || k[i] === 'h3';
  const fixed = OPENING_WORDS + base.reduce((s, w, i) => s + (growable(i) ? 0 : w), 0);
  const content = base.reduce((s, w, i) => s + (growable(i) ? w : 0), 0);
  const minimum = Math.round((fixed + content) / 50) * 50;
  const effective = Math.max(requested, minimum);
  // A generous target deepens the real sections, never the FAQ or the intro.
  const factor = content ? Math.max(1, (effective - fixed) / content) : 1;
  const weights = base.map((w, i) => (growable(i) ? Math.round((w * factor) / 5) * 5 : w));

  return {
    requested,
    minimum,
    effective,
    h2: outline.filter((h) => h.level === 2).length,
    h3: outline.filter((h) => h.level >= 3).length,
    weights,
    opening: OPENING_WORDS,
    perSection: Math.round((SECTION_WORDS * factor) / 5) * 5,
    perH3: Math.round((H3_WORDS * factor) / 5) * 5,
    perH2Intro: Math.round((H2_INTRO_WORDS * factor) / 5) * 5,
    raised: effective > requested,
  };
}

/** The most headings a word target can carry well, for the outline generator. */
export function maxSectionsFor(words: number): { h2: number; h3: number } {
  const total = Math.max(6, Math.round(words / WORDS_PER_HEADING));
  const h2 = Math.max(5, Math.min(8, total));
  return { h2, h3: Math.max(0, total - h2) };
}

// ── Outline ─────────────────────────────────────────────────────────────────

/**
 * Gives each question its own H3 under the FAQ section. Grouped FAQ headings
 * ("Tickets and entry") cannot hold a question-and-answer pair, which is the
 * shape featured snippets and AI answers lift.
 */
export function withFaqQuestions(outline: OutlineHeading[], questions: string[], max = 6): OutlineHeading[] {
  const qs = questions.map((q) => q.trim()).filter(Boolean).slice(0, max).map((q) => (q.endsWith('?') ? q : `${q}?`));
  if (!qs.length) return outline;
  const start = outline.findIndex((h) => h.level === 2 && FAQ.test(h.text));
  if (start === -1) return outline;
  let end = start + 1;
  while (end < outline.length && outline[end]!.level > 2) end++;
  return [...outline.slice(0, start + 1), ...qs.map((text) => ({ level: 3, text })), ...outline.slice(end)];
}

/**
 * Fits the outline to the length. Every H2 stays: it is a question in the
 * reader's journey. Subheadings stay only where a section is long enough for
 * at least two of them; the rest become points the section covers in prose.
 * A heading over two sentences reads as a list of fragments, not an article,
 * and nothing the outline promised is dropped.
 */
export function compactOutline(outline: OutlineHeading[], words: number): OutlineHeading[] {
  const k = kinds(outline);
  const h2 = outline.filter((h) => h.level === 2).length;
  const faqQs = k.filter((x) => x === 'faq-q').length;
  let spare = Math.max(0, Math.round(words / WORDS_PER_HEADING) - h2 - Math.min(faqQs, 3));

  // Content sections and their subheadings.
  const groups: { start: number; children: number[] }[] = [];
  outline.forEach((h, i) => {
    if (k[i] === 'intro' || k[i] === 'section') groups.push({ start: i, children: [] });
    else if (k[i] === 'h3') groups[groups.length - 1]?.children.push(i);
  });

  // The sections with the most distinct parts earn subheadings first.
  const keep = new Set<number>();
  for (const g of [...groups].sort((a, b) => b.children.length - a.children.length)) {
    if (g.children.length >= 2 && g.children.length <= spare) {
      g.children.forEach((i) => keep.add(i));
      spare -= g.children.length;
    }
  }

  const out: OutlineHeading[] = [];
  outline.forEach((h, i) => {
    if (k[i] !== 'h3' || keep.has(i)) {
      out.push({ ...h });
      return;
    }
    // Folded into the nearest kept heading above it, with anything it covered.
    const host = out[out.length - 1];
    if (host) host.covers = [...(host.covers ?? []), h.text, ...(h.covers ?? [])];
  });
  return out;
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
