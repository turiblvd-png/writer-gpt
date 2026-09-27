import { STOP_WORDS, EDGE_STOP } from './stopwords';
import type { Entity, NGram, NlpKeyword, SkipGram } from './types';

/**
 * Deterministic corpus analysis over extracted competitor text.
 *
 * None of this calls a model. N-grams, skip-grams and salience are *measurements*
 * of what ranking pages actually say — asking an LLM to guess them would produce
 * plausible invention, which is precisely the failure mode this product exists to
 * avoid. It is also free and reproducible, so a project can be re-analysed after
 * editing without spending credits.
 */

export interface Doc {
  url: string;
  text: string;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []) as string[];
}

/** Split on sentence and clause boundaries so phrases never span a full stop. */
export function tokenizeSentences(text: string): string[][] {
  return text
    .split(/[.!?;:\n]+|(?:,\s)/)
    .map((chunk) => tokenize(chunk))
    .filter((t) => t.length > 0);
}

export function extractNGrams(docs: Doc[], maxN = 3, minCount = 2): NGram[] {
  const totals = new Map<string, { count: number; docs: Set<string>; n: number }>();

  for (const doc of docs) {
    for (const sentence of tokenizeSentences(doc.text)) {
      for (let n = 1; n <= maxN; n++) {
        for (let i = 0; i + n <= sentence.length; i++) {
          const gram = sentence.slice(i, i + n);

          // A phrase starting or ending on a stop word ("of the tournament") is
          // noise; the meaningful span is the part between them.
          if (EDGE_STOP.has(gram[0]!) || EDGE_STOP.has(gram[n - 1]!)) continue;
          if (n === 1 && (gram[0]!.length < 4 || STOP_WORDS.has(gram[0]!))) continue;
          if (gram.every((w) => /^\d+$/.test(w))) continue;

          const key = gram.join(' ');
          const entry = totals.get(key) ?? { count: 0, docs: new Set<string>(), n };
          entry.count++;
          entry.docs.add(doc.url);
          totals.set(key, entry);
        }
      }
    }
  }

  return [...totals.entries()]
    .filter(([, v]) => v.count >= minCount)
    .map(([text, v]) => ({ text, n: v.n, count: v.count, documents: v.docs.size }))
    .sort((a, b) =>
      // Phrases shared across many competitors matter more than one page's tic.
      b.documents - a.documents || b.count - a.count || b.n - a.n || a.text.localeCompare(b.text),
    );
}

/**
 * Pairs that co-occur within a window without being adjacent. Adjacent pairs are
 * already covered by bigrams, so including them here would just duplicate.
 */
export function extractSkipGrams(docs: Doc[], windowSize = 4, minCount = 3): SkipGram[] {
  const totals = new Map<string, { count: number; gapSum: number }>();

  for (const doc of docs) {
    for (const sentence of tokenizeSentences(doc.text)) {
      const kept = sentence
        .map((word, index) => ({ word, index }))
        .filter(({ word }) => !STOP_WORDS.has(word) && word.length > 3);

      for (let i = 0; i < kept.length; i++) {
        for (let j = i + 1; j < kept.length; j++) {
          const gap = kept[j]!.index - kept[i]!.index - 1;
          if (gap < 1) continue;
          if (gap > windowSize) break;
          if (kept[i]!.word === kept[j]!.word) continue;

          // Order-independent: "netflix … broadcast" and the reverse are one pair.
          const key = [kept[i]!.word, kept[j]!.word].sort().join(' … ');
          const entry = totals.get(key) ?? { count: 0, gapSum: 0 };
          entry.count++;
          entry.gapSum += gap;
          totals.set(key, entry);
        }
      }
    }
  }

  return [...totals.entries()]
    .filter(([, v]) => v.count >= minCount)
    .map(([text, v]) => ({ text, count: v.count, gap: Math.round(v.gapSum / v.count) }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

/**
 * TF-IDF salience. Raw frequency ranks "tennis" above "exhibition tournament" on
 * a tennis page, which is useless; weighting by inverse document frequency
 * surfaces the terms that distinguish this topic from the corpus.
 */
export function extractNlpKeywords(docs: Doc[], limit = 60): NlpKeyword[] {
  if (!docs.length) return [];

  const perDoc = docs.map((d) => {
    const counts = new Map<string, number>();
    for (const token of tokenize(d.text)) {
      if (STOP_WORDS.has(token) || token.length < 4 || /^\d+$/.test(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return counts;
  });

  const documentFrequency = new Map<string, number>();
  for (const counts of perDoc) {
    for (const term of counts.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const totals = new Map<string, number>();
  for (const counts of perDoc) {
    for (const [term, n] of counts) totals.set(term, (totals.get(term) ?? 0) + n);
  }

  const N = docs.length;
  const scored: NlpKeyword[] = [];
  for (const [term, count] of totals) {
    const df = documentFrequency.get(term) ?? 1;
    // Smoothed IDF, so a term in every document still scores above zero.
    const idf = Math.log((N + 1) / (df + 0.5)) + 1;
    scored.push({ term, count, salience: round(Math.log(1 + count) * idf, 3) });
  }

  return scored
    .sort((a, b) => b.salience - a.salience || b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
}

/** Count how often known entities appear, so coverage targets are measured. */
export function measureEntities(docs: Doc[], names: string[]): Map<string, { mentions: number; documents: number }> {
  const out = new Map<string, { mentions: number; documents: number }>();

  for (const name of names) {
    const needle = name.toLowerCase().trim();
    if (!needle) continue;
    let mentions = 0;
    let documents = 0;

    for (const doc of docs) {
      const haystack = doc.text.toLowerCase();
      let from = 0;
      let inDoc = 0;
      for (;;) {
        const at = haystack.indexOf(needle, from);
        if (at === -1) break;
        // Require word boundaries so "T2" does not match inside "T20".
        const before = at === 0 ? ' ' : haystack[at - 1]!;
        const after = haystack[at + needle.length] ?? ' ';
        if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) inDoc++;
        from = at + needle.length;
      }
      if (inDoc > 0) documents++;
      mentions += inDoc;
    }
    out.set(name, { mentions, documents });
  }
  return out;
}

/** Fold measured frequencies into an entity list without losing ordering. */
export function annotateEntities(entities: Entity[], docs: Doc[]): Entity[] {
  const measured = measureEntities(docs, entities.map((e) => e.name));
  return entities.map((e) => {
    const m = measured.get(e.name);
    return { ...e, mentions: m?.mentions ?? 0, documentFrequency: m?.documents ?? 0 };
  });
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
