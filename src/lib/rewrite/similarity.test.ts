import { describe, expect, it } from 'vitest';
import { longestCommonRun, measureSimilarity, shingles, similarityVerdict } from './similarity';

const SOURCE = `The Six Kings Slam is an exhibition tennis tournament staged in Riyadh during Riyadh Season.
Organisers launched the inaugural edition in 2024 to bring the world's best players to Middle Eastern fans.
Because the competition is unsanctioned, players do not earn official ATP Tour ranking points.
Instead, organisers reward participants with guaranteed appearance fees and historic prize money sums.`;

describe('measureSimilarity', () => {
  it('reports near-total overlap for a copy', () => {
    const r = measureSimilarity(SOURCE, SOURCE);
    expect(r.containment).toBe(1);
    expect(r.longestCommonRun).toBeGreaterThan(30);
    expect(similarityVerdict(r).level).toBe('copied');
  });

  it('reports low overlap for a genuine rewrite carrying the same facts', () => {
    const rewrite = `Riyadh hosts six of tennis's biggest names each autumn, and the money on offer dwarfs most tour events.
None of it counts toward a ranking. The ATP has never sanctioned the event, so a win here changes nothing on paper.
What players get instead is an appearance fee, paid whether they lift the trophy or lose their opening match.
The first edition ran in 2024, built to put the sport in front of a Gulf audience that rarely sees it live.`;

    const r = measureSimilarity(rewrite, SOURCE);
    expect(r.containment).toBeLessThan(0.1);
    expect(similarityVerdict(r).level).toBe('original');
  });

  it('catches clause-level paraphrasing that still tracks the source', () => {
    // Same sentence shapes and order, a few words swapped. This is the failure
    // a naive "looks different" check would miss.
    const paraphrase = `The Six Kings Slam is an exhibition tennis tournament staged in Riyadh during Riyadh Season.
Organisers launched the first edition in 2024 to bring the world's best players to Middle Eastern fans.
Because the event is unsanctioned, players do not earn official ATP Tour ranking points.`;

    const r = measureSimilarity(paraphrase, SOURCE);
    expect(r.containment).toBeGreaterThan(0.5);
    expect(similarityVerdict(r).ok).toBe(false);
  });

  it('flags a long verbatim run even when overall overlap is small', () => {
    const mostlyNew = `${Array.from({ length: 160 }, (_, i) => `fresh sentence number ${i} about tennis here`).join('. ')}.
Because the competition is unsanctioned, players do not earn official ATP Tour ranking points instead organisers reward participants.`;

    const r = measureSimilarity(mostlyNew, SOURCE);
    expect(r.containment).toBeLessThan(0.1);
    expect(r.longestCommonRun).toBeGreaterThanOrEqual(15);
    expect(similarityVerdict(r).ok).toBe(false);
  });

  it('handles empty input without dividing by zero', () => {
    expect(measureSimilarity('', SOURCE)).toEqual({ containment: 0, longestCommonRun: 0, samples: [] });
  });

  it('returns the copied passages so the user can see them', () => {
    expect(measureSimilarity(SOURCE, SOURCE).samples.length).toBeGreaterThan(0);
  });
});

describe('longestCommonRun', () => {
  it('finds the run length exactly', () => {
    const a = 'one two three four five six seven'.split(' ');
    const b = 'nothing here three four five six nothing'.split(' ');
    expect(longestCommonRun(a, b)).toBe(4);
  });

  it('returns zero when nothing is shared', () => {
    expect(longestCommonRun(['alpha', 'beta'], ['gamma', 'delta'])).toBe(0);
  });
});

describe('shingles', () => {
  it('produces overlapping word windows', () => {
    expect(shingles('one two three four five six', 5)).toEqual(
      new Set(['one two three four five', 'two three four five six']),
    );
  });

  it('produces nothing for text shorter than the window', () => {
    expect(shingles('too short', 5).size).toBe(0);
  });
});
