/**
 * Deterministic text analysis over the generated markdown.
 *
 * Everything here runs locally with no model call. That matters: scoring must be
 * reproducible and free, so the editor can re-score on every keystroke and users
 * never burn credits to find out their title is too long.
 */

export interface Heading {
  level: number;
  text: string;
  /** Index in the source markdown, for anchoring editor jumps. */
  offset: number;
}

export interface DocStats {
  words: number;
  characters: number;
  /** Characters excluding whitespace — the count most SEO tools report. */
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  headings: Heading[];
  h2: number;
  h3: number;
  readingTimeMinutes: number;
}

const FENCE = /^```/;

/** Strip markdown syntax so counts reflect prose, not punctuation. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\r/g, '');
}

export function extractHeadings(markdown: string): Heading[] {
  const out: Heading[] = [];
  let offset = 0;
  let inFence = false;

  for (const line of markdown.split('\n')) {
    if (FENCE.test(line.trim())) inFence = !inFence;
    else if (!inFence) {
      const m = /^\s{0,3}(#{1,6})\s+(.*\S)\s*$/.exec(line);
      if (m) out.push({ level: m[1]!.length, text: m[2]!.trim(), offset });
    }
    offset += line.length + 1;
  }
  return out;
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []) as string[];
}

/**
 * Split into sentences. Guards the common abbreviations that would otherwise
 * inflate the sentence count and skew every per-sentence percentage below.
 */
export function splitSentences(text: string): string[] {
  const guarded = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|e\.g|i\.e|No|Fig|Inc|Ltd|Co)\./gi, '$1<DOT>')
    .replace(/\b([A-Z])\./g, '$1<DOT>')
    .replace(/(\d)\.(\d)/g, '$1<DOT>$2');

  return guarded
    .split(/(?<=[.!?])[\s\n]+/)
    .map((s) => s.replace(/<DOT>/g, '.').trim())
    .filter((s) => countWords(s) > 0);
}

export function splitParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^\s{0,3}#{1,6}\s+/.test(p));
}

export function analyseDocument(markdown: string): DocStats {
  const plain = toPlainText(markdown);
  const headings = extractHeadings(markdown);
  const wordCount = countWords(plain);

  return {
    words: wordCount,
    characters: plain.replace(/\s+/g, ' ').trim().length,
    charactersNoSpaces: plain.replace(/\s/g, '').length,
    sentences: splitSentences(plain).length,
    paragraphs: splitParagraphs(markdown).length,
    headings,
    h2: headings.filter((h) => h.level === 2).length,
    h3: headings.filter((h) => h.level === 3).length,
    // 225 wpm is the usual mid-point for adult non-fiction reading.
    readingTimeMinutes: Math.max(1, Math.round(wordCount / 225)),
  };
}

/** Count syllables — an English heuristic, good enough for Flesch scoring. */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;

  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export interface Readability {
  /** Flesch Reading Ease, 0–100. Higher is easier. */
  ease: number;
  /** Flesch–Kincaid US grade level. */
  grade: number;
  label: string;
}

export function readability(text: string): Readability {
  const sentences = splitSentences(text);
  const wordList = words(text);
  if (!sentences.length || !wordList.length) {
    return { ease: 0, grade: 0, label: 'Not enough text' };
  }

  const syllables = wordList.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordsPerSentence = wordList.length / sentences.length;
  const syllablesPerWord = syllables / wordList.length;

  const ease = clamp(206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord, 0, 100);
  const grade = Math.max(0, 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59);

  return { ease: round(ease, 1), grade: round(grade, 1), label: easeLabel(ease) };
}

function easeLabel(ease: number): string {
  if (ease >= 90) return 'Very easy';
  if (ease >= 80) return 'Easy';
  if (ease >= 70) return 'Fairly easy';
  if (ease >= 60) return 'Plain English';
  if (ease >= 50) return 'Fairly difficult';
  if (ease >= 30) return 'Difficult';
  return 'Very difficult';
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Approximate the rendered pixel width of a meta description, which is what
 * Google actually truncates on — character count alone misjudges wide strings.
 */
export function pixelWidth(text: string, fontSize = 14): number {
  let width = 0;
  for (const ch of text) {
    if ('iIl.,:;|!\'`'.includes(ch)) width += 0.28;
    else if ('fjrt()[]{}-'.includes(ch)) width += 0.38;
    else if ('mwMW'.includes(ch)) width += 0.92;
    else if (ch === ' ') width += 0.26;
    else if (ch >= 'A' && ch <= 'Z') width += 0.68;
    else width += 0.53;
  }
  return Math.round(width * fontSize);
}
