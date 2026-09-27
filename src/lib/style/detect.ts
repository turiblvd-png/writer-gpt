import { splitSentences, toPlainText, countWords } from '@/lib/seo/text';
import { DOUBLE_HYPHEN, EM_DASH, PHRASE_TELLS, TRANSITION_OPENERS, type TellSeverity } from './patterns';

/**
 * Measures how much a draft reads like machine output.
 *
 * Phrase hits are the obvious half. The statistical half matters more: models
 * produce unusually even sentence and paragraph lengths, because they optimise
 * each sentence independently rather than varying rhythm for effect. A draft can
 * contain none of the stock phrases and still be obviously generated.
 */

export interface TellHit {
  id: string;
  label: string;
  severity: TellSeverity;
  count: number;
  fix: string;
  /** First occurrences, for showing the user where the problem is. */
  samples: string[];
}

export interface StyleReport {
  /** 0–100. Higher means it reads more like a person wrote it. */
  humanScore: number;
  hits: TellHit[];
  emDashes: number;
  /** Coefficient of variation of sentence length. Low means robotic evenness. */
  sentenceVariation: number;
  /** Share of sentences opening with a stock transition. */
  transitionOpenerRatio: number;
  /** Longest run of consecutive sentences within 3 words of each other. */
  longestUniformRun: number;
  sentences: number;
  words: number;
}

const round = (n: number, dp = 3) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export function detectTells(markdown: string): StyleReport {
  const plain = toPlainText(markdown);
  const sentences = splitSentences(plain);
  const words = countWords(plain);

  const hits: TellHit[] = [];
  for (const tell of PHRASE_TELLS) {
    // Regexes are module-level with /g, so lastIndex must not leak between calls.
    tell.pattern.lastIndex = 0;
    const matches = [...plain.matchAll(tell.pattern)];
    if (!matches.length) continue;

    // "Furthermore" once is fine; it only becomes a tell when stacked.
    const threshold = tell.id === 'furthermore' ? 3 : tell.id === 'crucial' ? 3 : 1;
    if (matches.length < threshold) continue;

    hits.push({
      id: tell.id,
      label: tell.label,
      severity: tell.severity,
      count: matches.length,
      fix: tell.fix,
      samples: matches.slice(0, 3).map((m) => contextAround(plain, m.index ?? 0, m[0].length)),
    });
  }

  EM_DASH.lastIndex = 0;
  DOUBLE_HYPHEN.lastIndex = 0;
  const emDashes = (plain.match(EM_DASH)?.length ?? 0) + (plain.match(DOUBLE_HYPHEN)?.length ?? 0);

  const lengths = sentences.map((s) => countWords(s)).filter((n) => n > 0);
  const sentenceVariation = coefficientOfVariation(lengths);
  const longestUniformRun = longestRunWithin(lengths, 3);

  const openers = sentences.filter((s) => {
    const first = s.toLowerCase().replace(/^[^\p{L}]+/u, '').split(/[\s,]/)[0] ?? '';
    return TRANSITION_OPENERS.includes(first) ||
      TRANSITION_OPENERS.some((t) => t.includes(' ') && s.toLowerCase().startsWith(t));
  }).length;
  const transitionOpenerRatio = sentences.length ? openers / sentences.length : 0;

  return {
    humanScore: score({ hits, emDashes, sentenceVariation, transitionOpenerRatio, longestUniformRun, sentences: sentences.length }),
    hits: hits.sort((a, b) => weight(b.severity) - weight(a.severity) || b.count - a.count),
    emDashes,
    sentenceVariation: round(sentenceVariation),
    transitionOpenerRatio: round(transitionOpenerRatio),
    longestUniformRun,
    sentences: sentences.length,
    words,
  };
}

const weight = (s: TellSeverity) => (s === 'critical' ? 3 : s === 'major' ? 2 : 1);

function score(input: {
  hits: TellHit[];
  emDashes: number;
  sentenceVariation: number;
  transitionOpenerRatio: number;
  longestUniformRun: number;
  sentences: number;
}): number {
  if (!input.sentences) return 0;
  let penalty = 0;

  // Phrase tells, weighted by severity and capped so one repeated word cannot
  // sink an otherwise clean draft on its own.
  for (const hit of input.hits) {
    const per = hit.severity === 'critical' ? 9 : hit.severity === 'major' ? 5 : 2;
    penalty += Math.min(per * hit.count, per * 3);
  }

  // Em dashes are an explicit requirement, so each one is expensive.
  penalty += Math.min(input.emDashes * 6, 30);

  // Below ~0.35 the prose is suspiciously even. Above 0.5 reads naturally.
  if (input.sentenceVariation < 0.35) penalty += (0.35 - input.sentenceVariation) * 80;

  // More than a fifth of sentences opening on a stock transition is a tell.
  if (input.transitionOpenerRatio > 0.2) penalty += (input.transitionOpenerRatio - 0.2) * 60;

  // Five-plus consecutive sentences of near-identical length reads as generated.
  if (input.longestUniformRun >= 5) penalty += Math.min((input.longestUniformRun - 4) * 4, 16);

  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

/** Relative standard deviation. Zero means every sentence is the same length. */
export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Longest stretch of consecutive values all within `tolerance` of each other. */
export function longestRunWithin(values: number[], tolerance: number): number {
  if (values.length < 2) return values.length;
  let best = 1;
  let start = 0;

  for (let end = 1; end < values.length; end++) {
    while (start < end) {
      const window = values.slice(start, end + 1);
      if (Math.max(...window) - Math.min(...window) <= tolerance) break;
      start++;
    }
    best = Math.max(best, end - start + 1);
  }
  return best;
}

function contextAround(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 35);
  const to = Math.min(text.length, index + length + 35);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ').trim()}${to < text.length ? '…' : ''}`;
}

/** Compact feedback for a repair prompt. */
export function tellsAsInstructions(report: StyleReport): string[] {
  const lines: string[] = [];
  if (report.emDashes) {
    lines.push(`Remove all ${report.emDashes} em dash(es). Rewrite those sentences with commas, colons or full stops.`);
  }
  for (const hit of report.hits) {
    lines.push(`Remove "${hit.label}" (${hit.count}×). ${hit.fix}`);
  }
  if (report.sentenceVariation < 0.35) {
    lines.push('Sentence lengths are too uniform. Break some sentences up and let others run long.');
  }
  if (report.transitionOpenerRatio > 0.2) {
    lines.push('Too many sentences open with a stock transition. Start most sentences with the subject.');
  }
  return lines;
}
