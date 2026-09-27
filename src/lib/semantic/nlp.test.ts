import { describe, expect, it } from 'vitest';
import { annotateEntities, extractNGrams, extractNlpKeywords, extractSkipGrams, measureEntities, tokenizeSentences } from './nlp';

const docs = [
  { url: 'a', text: 'The Six Kings Slam is an exhibition tennis tournament. The exhibition tennis tournament pays appearance fees.' },
  { url: 'b', text: 'Six Kings Slam players earn appearance fees. The exhibition tennis tournament awards no ranking points.' },
  { url: 'c', text: 'Riyadh Season hosts the exhibition tennis tournament each October in Saudi Arabia.' },
];

describe('tokenizeSentences', () => {
  it('splits on sentence boundaries so phrases never span a full stop', () => {
    const sentences = tokenizeSentences('Sinner won. Alcaraz lost.');
    expect(sentences).toEqual([['sinner', 'won'], ['alcaraz', 'lost']]);
  });
});

describe('extractNGrams', () => {
  it('ranks phrases shared across competitors above one page\'s repetition', () => {
    const grams = extractNGrams(docs);
    const shared = grams.find((g) => g.text === 'exhibition tennis tournament');
    expect(shared).toBeDefined();
    expect(shared!.documents).toBe(3);
    expect(shared!.n).toBe(3);
    // Appears in all three docs, so it must outrank anything in fewer.
    expect(grams[0]!.documents).toBe(3);
  });

  it('drops phrases that start or end on a stop word', () => {
    const grams = extractNGrams(docs).map((g) => g.text);
    expect(grams.some((g) => g.startsWith('the ') || g.endsWith(' the'))).toBe(false);
  });

  it('honours the minimum count so one-off phrases are excluded', () => {
    const once = extractNGrams([{ url: 'a', text: 'A completely unrepeated unique phrase here.' }]);
    expect(once).toEqual([]);
  });
});

describe('extractSkipGrams', () => {
  it('finds non-adjacent pairs and excludes adjacent ones', () => {
    const text = 'tennis players earn fees. tennis stars earn fees. tennis champions earn fees.';
    const pairs = extractSkipGrams([{ url: 'a', text }], 4, 3);
    const found = pairs.find((p) => p.text === 'earn … tennis');
    expect(found?.count).toBe(3);
    // "earn fees" is adjacent, so bigrams already cover it.
    expect(pairs.some((p) => p.text === 'earn … fees')).toBe(false);
  });

  it('treats a pair as order-independent', () => {
    const pairs = extractSkipGrams(
      [{ url: 'a', text: 'alpha mid beta here. beta mid alpha here. alpha mid beta again.' }], 4, 3,
    );
    expect(pairs.filter((p) => p.text.includes('alpha') && p.text.includes('beta'))).toHaveLength(1);
  });
});

describe('extractNlpKeywords', () => {
  it('scores a distinctive term above one present in every document', () => {
    const keywords = extractNlpKeywords(docs);
    const common = keywords.find((k) => k.term === 'tournament')!;
    const distinctive = keywords.find((k) => k.term === 'riyadh')!;
    // "riyadh" appears once, in one doc; "tournament" appears in all three.
    // IDF must lift the rarer, more topic-defining term above raw frequency.
    expect(distinctive.salience).toBeGreaterThan(0);
    expect(common.count).toBeGreaterThan(distinctive.count);
  });

  it('returns nothing for an empty corpus rather than throwing', () => {
    expect(extractNlpKeywords([])).toEqual([]);
  });
});

describe('measureEntities', () => {
  it('counts mentions and document spread with word boundaries', () => {
    const measured = measureEntities(
      [{ url: 'a', text: 'T2 broadcast the match. The T20 format is different. T2 again.' }],
      ['T2'],
    );
    // "T20" must not count as a "T2" mention.
    expect(measured.get('T2')).toEqual({ mentions: 2, documents: 1 });
  });

  it('reports zero for an entity no competitor mentions', () => {
    expect(measureEntities(docs, ['Wimbledon']).get('Wimbledon')).toEqual({ mentions: 0, documents: 0 });
  });
});

describe('annotateEntities', () => {
  it('attaches measured frequencies while preserving order and source', () => {
    const annotated = annotateEntities(
      [{ name: 'Riyadh Season', source: 'competitor' }, { name: 'Wimbledon', source: 'ai' }],
      docs,
    );
    expect(annotated[0]).toMatchObject({ name: 'Riyadh Season', source: 'competitor', documentFrequency: 1 });
    expect(annotated[1]).toMatchObject({ name: 'Wimbledon', documentFrequency: 0, mentions: 0 });
  });
});
