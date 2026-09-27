import {
  analyseDocument,
  countWords,
  pixelWidth,
  readability,
  round,
  splitSentences,
  toPlainText,
  words,
  type DocStats,
} from './text';
import { BE_FORMS, IRREGULAR_PARTICIPLES, POWER_WORDS, TRANSITION_PHRASES, TRANSITION_WORDS } from './words';

export type CheckStatus = 'good' | 'ok' | 'warn' | 'bad';
export type CheckCategory = 'title' | 'description' | 'keyword' | 'structure' | 'readability' | 'freshness';

export interface Check {
  id: string;
  category: CheckCategory;
  status: CheckStatus;
  message: string;
  /** Whether a model can plausibly repair this automatically. */
  autoFixable: boolean;
}

export interface SeoInput {
  markdown: string;
  title: string;
  metaDescription: string;
  focusKeyword: string;
  slug?: string;
  /** Run date, so freshness checks never assume the model's training cutoff. */
  now?: Date;
}

export interface SeoReport {
  score: number;
  checks: Check[];
  stats: DocStats;
  keywordDensity: number;
  keywordCount: number;
  transitionRatio: number;
  passiveRatio: number;
  readability: ReturnType<typeof readability>;
  passed: number;
  warnings: number;
  problems: number;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Does `haystack` contain every token of the keyphrase, in order? */
function containsKeyphrase(haystack: string, keyword: string): boolean {
  const k = norm(keyword);
  if (!k) return false;
  return norm(haystack).includes(k);
}

export function countKeyphrase(text: string, keyword: string): number {
  const k = norm(keyword);
  if (!k) return 0;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return (norm(text).match(new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'giu')) ?? []).length;
}

export function transitionRatio(sentences: string[]): number {
  if (!sentences.length) return 0;
  let hits = 0;
  for (const raw of sentences) {
    const s = norm(raw);
    const hasPhrase = TRANSITION_PHRASES.some((p) => s.includes(p));
    const hasWord =
      !hasPhrase && s.split(/[^\p{L}']+/u).slice(0, 4).some((w) => TRANSITION_WORDS.has(w));
    if (hasPhrase || hasWord) hits++;
  }
  return hits / sentences.length;
}

/** Heuristic passive detection: a "to be" form followed closely by a participle. */
export function passiveRatio(sentences: string[]): number {
  if (!sentences.length) return 0;
  let hits = 0;

  for (const sentence of sentences) {
    const tokens = words(sentence);
    for (let i = 0; i < tokens.length - 1; i++) {
      if (!BE_FORMS.has(tokens[i]!)) continue;
      // Allow one adverb between the auxiliary and the participle ("was quickly built").
      for (const j of [i + 1, i + 2]) {
        const next = tokens[j];
        if (!next) continue;
        if (j === i + 2 && !next.endsWith('ly') && !IRREGULAR_PARTICIPLES.has(next)) break;
        const participle = IRREGULAR_PARTICIPLES.has(next) || (next.endsWith('ed') && next.length > 4);
        if (participle) {
          hits++;
          i = tokens.length;
          break;
        }
      }
    }
  }
  return hits / sentences.length;
}

/**
 * Detects whether a topic is time-bound (an event, a year, a "best of" list) and
 * whether the copy actually addresses the current period.
 *
 * This exists because of a concrete failure: an article generated 23 days before
 * the 2026 event never mentioned 2026 and read as a 2024/2025 retrospective.
 * A stale angle is invisible to every standard SEO checker, and it is the single
 * biggest reason a technically clean article fails to rank on a live query.
 */
export function freshnessChecks(input: SeoInput, plain: string): Check[] {
  const now = input.now ?? new Date();
  const year = now.getFullYear();
  const haystack = `${input.title} ${input.metaDescription} ${plain}`;
  const subject = `${input.title} ${input.focusKeyword}`;

  const yearsMentioned = [...haystack.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));

  // Years close enough to now to signal a recurring or scheduled subject.
  // A single stray year (a founding date, a citation) is not enough; two or more
  // distinct recent years means the piece is tracking something that recurs.
  const recentYears = new Set(yearsMentioned.filter((y) => y >= year - 6 && y <= year + 3));

  // The title alone is an unreliable signal. The article that motivated this
  // check was titled "6 Facts About the Elite Tennis Showdown" — no year, no
  // trigger word — while its body was wall-to-wall 2024/2025 event dates.
  const timeBound =
    /\b(20\d{2})\b/.test(subject) ||
    /\b(best|top|latest|new|upcoming|guide|schedule|dates?|tickets?|how to watch|release|deadline|calendar|season|edition|fixtures?|lineup|results?)\b/i.test(
      subject,
    ) ||
    recentYears.size >= 2;

  if (!timeBound) return [];

  const checks: Check[] = [];
  const mentionsCurrent = yearsMentioned.includes(year);
  const newest = yearsMentioned.length ? Math.max(...yearsMentioned) : 0;

  checks.push(
    mentionsCurrent
      ? { id: 'freshness-current-year', category: 'freshness', status: 'good', autoFixable: false,
          message: `Content references the current year (${year}). Good — the angle matches live search intent.` }
      : { id: 'freshness-current-year', category: 'freshness', status: 'bad', autoFixable: true,
          message: newest
            ? `Topic is time-sensitive but the newest year mentioned is ${newest}, not ${year}. This reads as a retrospective and will lose to pages targeting ${year}.`
            : `Topic is time-sensitive but no year is mentioned. Anchor the article to ${year} explicitly.` },
  );

  if (/\b(20\d{2})\b/.test(input.focusKeyword) && !/\b(20\d{2})\b/.test(input.title)) {
    checks.push({ id: 'freshness-title-year', category: 'freshness', status: 'warn', autoFixable: true,
      message: 'Focus keyword contains a year but the SEO title does not. Add it — year modifiers are high-intent.' });
  }

  return checks;
}

export function analyseSeo(input: SeoInput): SeoReport {
  const { markdown, title, metaDescription, focusKeyword } = input;
  const stats = analyseDocument(markdown);
  const plain = toPlainText(markdown);
  const sentences = splitSentences(plain);
  const totalWords = countWords(plain);

  const kwCount = countKeyphrase(plain, focusKeyword);
  const kwWords = Math.max(1, countWords(focusKeyword));
  const density = totalWords ? round(((kwCount * kwWords) / totalWords) * 100, 2) : 0;
  const transitions = transitionRatio(sentences);
  const passive = passiveRatio(sentences);
  const read = readability(plain);

  const checks: Check[] = [];
  const add = (
    id: string, category: CheckCategory, status: CheckStatus, message: string, autoFixable = false,
  ) => checks.push({ id, category, status, message, autoFixable });

  // ---- Title -------------------------------------------------------------
  const titleLen = title.length;
  if (titleLen === 0) add('title-present', 'title', 'bad', 'No SEO title set.', true);
  else if (titleLen < 30) add('title-length', 'title', 'warn', `SEO title is short (${titleLen}/60 chars). Use the space.`, true);
  else if (titleLen <= 60) add('title-length', 'title', 'good', `SEO title length is optimal (${titleLen}/60 chars).`);
  else add('title-length', 'title', 'bad', `SEO title is ${titleLen} chars and will be truncated at ~60.`, true);

  if (/\d/.test(title)) add('title-number', 'title', 'good', 'Your SEO title contains a number. Good!');
  else add('title-number', 'title', 'warn', 'Your SEO title has no number. Numbers lift click-through.', true);

  const hasPower = words(title).some((w) => POWER_WORDS.has(w));
  if (hasPower) add('title-power', 'title', 'good', 'Your title contains a power word. Good!');
  else add('title-power', 'title', 'warn', "Your title doesn't contain a power word. Add at least one.", true);

  if (containsKeyphrase(title, focusKeyword)) {
    add('title-keyword', 'keyword', 'good', 'Focus keyword found in SEO title. Great!');
    if (norm(title).startsWith(norm(focusKeyword))) {
      add('title-keyword-position', 'keyword', 'good', 'Keyphrase appears at the beginning of the title. Great!');
    } else {
      add('title-keyword-position', 'keyword', 'ok', 'Keyphrase is in the title but not at the start. Move it earlier.', true);
    }
  } else {
    add('title-keyword', 'keyword', 'bad', 'Focus keyword is missing from the SEO title.', true);
  }

  // ---- Meta description --------------------------------------------------
  const descLen = metaDescription.length;
  const descPx = pixelWidth(metaDescription);
  if (descLen === 0) add('desc-present', 'description', 'bad', 'No meta description set.', true);
  else if (descLen < 120) add('desc-length', 'description', 'warn', `Meta description is short (${descLen}/155 chars, ~${descPx}px).`, true);
  else if (descLen <= 155) add('desc-length', 'description', 'good', `Meta description length is optimal (${descLen}/155 chars, ~${descPx}px).`);
  else add('desc-length', 'description', 'bad', `Meta description is ${descLen} chars and will be truncated.`, true);

  add(
    'desc-keyword', 'keyword',
    containsKeyphrase(metaDescription, focusKeyword) ? 'good' : 'bad',
    containsKeyphrase(metaDescription, focusKeyword)
      ? 'Focus keyword found in meta description. Great!'
      : 'Focus keyword is missing from the meta description.',
    true,
  );

  // ---- Structure ---------------------------------------------------------
  const subheads = stats.headings.filter((h) => h.level >= 2);
  const subWithKw = subheads.filter((h) => containsKeyphrase(h.text, focusKeyword)).length;
  const subPct = subheads.length ? Math.round((subWithKw / subheads.length) * 100) : 0;

  if (!subheads.length) add('subheadings', 'structure', 'bad', 'No subheadings found. Break the article up with H2s.', true);
  else if (subPct >= 30 && subPct <= 75) add('subheadings-keyword', 'structure', 'good', `${subWithKw}/${subheads.length} subheadings (${subPct}%) contain the keyphrase. Good!`);
  else if (subPct < 30) add('subheadings-keyword', 'structure', 'warn', `Only ${subWithKw}/${subheads.length} subheadings (${subPct}%) contain the keyphrase. Aim for 30–75%.`, true);
  else add('subheadings-keyword', 'structure', 'warn', `${subPct}% of subheadings contain the keyphrase — that reads as stuffing. Aim for 30–75%.`, true);

  if (stats.h3 === 0 && stats.h2 > 6) {
    add('heading-depth', 'structure', 'warn', `${stats.h2} H2s and no H3s — the outline is flat. Nest detail under H3s so sections are scannable.`, true);
  }

  if (totalWords < 300) add('content-length', 'structure', 'bad', `Only ${totalWords} words. Too thin to compete.`, true);
  else if (totalWords < 900) add('content-length', 'structure', 'warn', `${totalWords} words. Most ranking pages for competitive terms run longer.`, true);
  else add('content-length', 'structure', 'good', `Article length is solid (${totalWords} words).`);

  const firstPara = plain.split(/\n\s*\n/).map((p) => p.trim()).find((p) => countWords(p) > 15) ?? '';
  add(
    'keyword-intro', 'keyword',
    containsKeyphrase(firstPara, focusKeyword) ? 'good' : 'warn',
    containsKeyphrase(firstPara, focusKeyword)
      ? 'Focus keyword appears in the opening paragraph. Great!'
      : 'Focus keyword does not appear in the opening paragraph. Add it early.',
    true,
  );

  // ---- Keyword density ---------------------------------------------------
  if (kwCount === 0) add('density', 'keyword', 'bad', 'Focus keyword never appears in the body.', true);
  else if (density < 0.5) add('density', 'keyword', 'warn', `Keyword density is ${density}% (${kwCount} uses). A little low.`, true);
  else if (density <= 2.5) add('density', 'keyword', 'good', `Keyword density is ${density}% (${kwCount} uses). Good!`);
  else add('density', 'keyword', 'bad', `Keyword density is ${density}% (${kwCount} uses) — that reads as stuffing.`, true);

  // ---- Readability -------------------------------------------------------
  const passivePct = Math.round(passive * 100);
  add(
    'passive-voice', 'readability',
    passivePct <= 10 ? 'good' : passivePct <= 20 ? 'warn' : 'bad',
    passivePct <= 10
      ? `Passive voice is within limits (${passivePct}%). Good!`
      : `${passivePct}% of sentences use passive voice (max 10%). Rewrite in active voice.`,
    true,
  );

  const transPct = Math.round(transitions * 100);
  add(
    'transition-words', 'readability',
    transPct >= 30 ? 'good' : 'warn',
    transPct >= 30
      ? `${transPct}% of sentences use transition words. Good!`
      : `Only ${transPct}% of sentences use transition words (min 30%). Add more connectors.`,
    true,
  );

  add(
    'readability-grade', 'readability',
    read.grade <= 12 ? 'good' : read.grade <= 14 ? 'warn' : 'bad',
    `Reading ease ${read.ease} (${read.label}), grade ${read.grade}.`,
    true,
  );

  // ---- Slug --------------------------------------------------------------
  if (input.slug) {
    const slugOk = containsKeyphrase(input.slug.replace(/-/g, ' '), focusKeyword);
    add('slug-keyword', 'keyword', slugOk ? 'good' : 'warn',
      slugOk ? 'Focus keyword found in the URL slug. Great!' : 'Focus keyword is missing from the URL slug.', true);
    if (input.slug.length > 75) {
      add('slug-length', 'structure', 'warn', `Slug is ${input.slug.length} chars. Shorten it.`, true);
    }
  }

  checks.push(...freshnessChecks(input, plain));

  const weights: Record<CheckStatus, number> = { good: 1, ok: 0.75, warn: 0.4, bad: 0 };
  // Freshness is weighted double: a stale angle sinks an otherwise perfect page.
  const weightFor = (c: Check) => (c.category === 'freshness' ? 2 : 1);
  const totalWeight = checks.reduce((sum, c) => sum + weightFor(c), 0);
  const earned = checks.reduce((sum, c) => sum + weights[c.status] * weightFor(c), 0);

  return {
    score: totalWeight ? Math.round((earned / totalWeight) * 100) : 0,
    checks,
    stats,
    keywordDensity: density,
    keywordCount: kwCount,
    transitionRatio: round(transitions, 3),
    passiveRatio: round(passive, 3),
    readability: read,
    passed: checks.filter((c) => c.status === 'good').length,
    warnings: checks.filter((c) => c.status === 'warn' || c.status === 'ok').length,
    problems: checks.filter((c) => c.status === 'bad').length,
  };
}
