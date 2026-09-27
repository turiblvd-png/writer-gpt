/**
 * Measures how much of a rewrite is still the source's wording.
 *
 * "Rewrite it in my voice" fails silently when a model paraphrases clause by
 * clause: the output looks different but carries the source's sentence shapes,
 * which is both a duplicate-content risk and the reason such pages never
 * outrank the original. Containment over word shingles catches that, and it is
 * deterministic, so it costs nothing to check on every rewrite.
 */

const SHINGLE = 5;

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) as string[];
}

export function shingles(text: string, size = SHINGLE): Set<string> {
  const words = tokens(text);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) {
    out.add(words.slice(i, i + size).join(' '));
  }
  return out;
}

export interface SimilarityResult {
  /** Share of the rewrite's phrases that also appear in the source, 0–1. */
  containment: number;
  /** Longest run of consecutive words copied verbatim. */
  longestCommonRun: number;
  /** Examples of copied passages, for showing the user what to fix. */
  samples: string[];
}

export function measureSimilarity(rewrite: string, source: string): SimilarityResult {
  const rewriteShingles = shingles(rewrite);
  if (rewriteShingles.size === 0) {
    return { containment: 0, longestCommonRun: 0, samples: [] };
  }

  const sourceShingles = shingles(source);
  const shared: string[] = [];
  for (const s of rewriteShingles) {
    if (sourceShingles.has(s)) shared.push(s);
  }

  return {
    containment: round(shared.length / rewriteShingles.size),
    longestCommonRun: longestCommonRun(tokens(rewrite), tokens(source)),
    samples: shared.slice(0, 5),
  };
}

/**
 * Longest shared consecutive word sequence, via a rolling set per length.
 * A full dynamic-programming LCS would be O(n·m) and these are whole articles,
 * so this doubles the window while a match exists and then walks back.
 */
export function longestCommonRun(a: string[], b: string[], cap = 60): number {
  if (!a.length || !b.length) return 0;

  const windows = (words: string[], size: number) => {
    const set = new Set<string>();
    for (let i = 0; i + size <= words.length; i++) set.add(words.slice(i, i + size).join(' '));
    return set;
  };

  const hasRun = (size: number) => {
    if (size > a.length || size > b.length) return false;
    const bSet = windows(b, size);
    for (let i = 0; i + size <= a.length; i++) {
      if (bSet.has(a.slice(i, i + size).join(' '))) return true;
    }
    return false;
  };

  if (!hasRun(1)) return 0;

  let low = 1;
  let high = Math.min(cap, a.length, b.length);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (hasRun(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Thresholds for judging a rewrite, with the reason surfaced to the user. */
export function similarityVerdict(result: SimilarityResult): {
  ok: boolean;
  level: 'original' | 'derivative' | 'copied';
  message: string;
} {
  if (result.containment >= 0.25 || result.longestCommonRun >= 25) {
    return {
      ok: false,
      level: 'copied',
      message: `${Math.round(result.containment * 100)}% of phrasing matches the source, with a ${result.longestCommonRun}-word verbatim run. This is paraphrasing, not a rewrite, and will be treated as duplicate content.`,
    };
  }
  if (result.containment >= 0.1 || result.longestCommonRun >= 15) {
    return {
      ok: false,
      level: 'derivative',
      message: `${Math.round(result.containment * 100)}% of phrasing still matches the source. Reorganise around the reader rather than following the source's order.`,
    };
  }
  return {
    ok: true,
    level: 'original',
    message: `Wording is original (${Math.round(result.containment * 100)}% overlap, longest shared run ${result.longestCommonRun} words).`,
  };
}
