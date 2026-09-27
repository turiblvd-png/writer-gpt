import { describe, expect, it } from 'vitest';
import { annotateEntities } from './nlp';
import type { Entity } from './types';

/**
 * Guards the required/optional split the mega prompt depends on: an entity's
 * document frequency must reflect the current corpus, not the corpus that
 * existed when the entity list was first generated.
 */
describe('entity re-measurement after corpus changes', () => {
  const entities: Entity[] = [
    { name: 'Netflix', source: 'competitor', documentFrequency: 0, mentions: 0 },
    { name: 'Wimbledon', source: 'ai', documentFrequency: 0, mentions: 0 },
  ];

  it('lifts counts from zero once content exists', () => {
    const docs = [
      { url: 'a', text: 'Netflix streams the tournament live worldwide.' },
      { url: 'b', text: 'Subscribers watch on Netflix without extra fees.' },
    ];
    const after = annotateEntities(entities, docs);

    expect(after[0]).toMatchObject({ name: 'Netflix', documentFrequency: 2, mentions: 2 });
    expect(after[1]).toMatchObject({ name: 'Wimbledon', documentFrequency: 0, mentions: 0 });
  });

  it('drops counts back down when a competitor is removed', () => {
    const measured = annotateEntities(entities, [
      { url: 'a', text: 'Netflix streams it.' },
      { url: 'b', text: 'Also on Netflix.' },
    ]);
    expect(measured[0]!.documentFrequency).toBe(2);

    const rerun = annotateEntities(measured, [{ url: 'a', text: 'Netflix streams it.' }]);
    expect(rerun[0]!.documentFrequency).toBe(1);
  });

  it('measures an entity to zero when no competitor mentions it any more', () => {
    const rerun = annotateEntities(entities, [{ url: 'a', text: 'Nothing relevant here at all.' }]);
    expect(rerun.every((e) => e.documentFrequency === 0)).toBe(true);
  });
});
