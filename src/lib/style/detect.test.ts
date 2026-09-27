import { describe, expect, it } from 'vitest';
import { coefficientOfVariation, detectTells, longestRunWithin, tellsAsInstructions } from './detect';
import { replaceEmDashes, sanitizeDraft } from './sanitize';

const HUMAN = `# Six Kings Slam 2026

The tournament runs 21 to 24 October. Six players. Two of them skip the quarterfinals entirely, which is the part most previews get wrong.

Sinner has won both previous editions. He beat Alcaraz in each final, and the 2025 scoreline was 6-2, 6-4. Whether that holds a third time depends mostly on whether Alcaraz has fixed his second serve, and nobody outside his camp knows that yet.

Tickets went on sale through Riyadh Season in September. Prices start around 400 SAR for the upper tiers and climb steeply.`;

const MACHINE = `# Understanding the Six Kings Slam

In today's digital age, the Six Kings Slam has emerged as a game-changer in the ever-evolving landscape of professional tennis. This article will explore the tournament in detail.

It is important to note that the event plays a crucial role in the region. Furthermore, the tournament leverages a robust format. Moreover, it offers a seamless viewing experience for fans. Additionally, the prize fund is comprehensive.

When it comes to the players, the field is a testament to the event's pull. Let us delve into the rich tapestry of talent on display.`;

describe('detectTells', () => {
  it('scores human-sounding prose far above machine-sounding prose', () => {
    const human = detectTells(HUMAN);
    const machine = detectTells(MACHINE);

    expect(human.humanScore).toBeGreaterThan(80);
    expect(machine.humanScore).toBeLessThan(25);
    expect(machine.hits.length).toBeGreaterThan(6);
  });

  it('names the specific stock phrases it found, with context', () => {
    const ids = detectTells(MACHINE).hits.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining([
      'digital-age', 'game-changer', 'landscape', 'article-will',
      'important-to-note', 'delve', 'tapestry', 'testament', 'when-it-comes',
    ]));

    const delve = detectTells(MACHINE).hits.find((h) => h.id === 'delve')!;
    expect(delve.samples[0]).toContain('delve into');
    expect(delve.severity).toBe('critical');
  });

  it('sorts the most damaging tells first', () => {
    const hits = detectTells(MACHINE).hits;
    expect(hits[0]!.severity).toBe('critical');
  });

  it('allows one "furthermore" but flags a stack of them', () => {
    const once = detectTells('The match ran late. Furthermore, the crowd stayed to the end of it.');
    expect(once.hits.some((h) => h.id === 'furthermore')).toBe(false);

    const thrice = detectTells(
      'Rain fell. Furthermore, the roof stuck. Furthermore, the lights failed. Furthermore, nobody explained why.',
    );
    expect(thrice.hits.some((h) => h.id === 'furthermore')).toBe(true);
  });

  it('counts em dashes but leaves numeric ranges alone', () => {
    // An en dash between numbers is correct typography, not a tell.
    expect(detectTells('The event runs October 15–18 across 2024–2026.').emDashes).toBe(0);
    expect(detectTells('The event — which nobody expected — ran late.').emDashes).toBe(2);
  });

  it('is not fooled by clean vocabulary with robotic rhythm', () => {
    // No stock phrases at all, but every sentence is the same length.
    const even = Array.from({ length: 10 }, (_, i) =>
      `The ${['player', 'coach', 'umpire', 'crowd', 'venue'][i % 5]} arrived early and waited quietly there.`,
    ).join(' ');
    const report = detectTells(even);

    expect(report.hits).toHaveLength(0);
    expect(report.sentenceVariation).toBeLessThan(0.35);
    expect(report.longestUniformRun).toBeGreaterThanOrEqual(5);
    expect(report.humanScore).toBeLessThan(75);
  });

  it('does not leak regex state between calls', () => {
    const a = detectTells(MACHINE).hits.length;
    const b = detectTells(MACHINE).hits.length;
    expect(a).toBe(b);
  });

  it('turns findings into repair instructions', () => {
    const lines = tellsAsInstructions(detectTells(MACHINE));
    expect(lines.join('\n')).toMatch(/delve/i);
    expect(lines.length).toBeGreaterThan(3);
  });
});

describe('coefficientOfVariation / longestRunWithin', () => {
  it('returns zero variation for identical lengths', () => {
    expect(coefficientOfVariation([10, 10, 10, 10])).toBe(0);
    expect(coefficientOfVariation([4, 22, 9, 31, 7])).toBeGreaterThan(0.5);
  });

  it('finds the longest near-identical run', () => {
    // 5,5,6,7,8 spans exactly 3, so it qualifies as a run of five.
    expect(longestRunWithin([10, 11, 12, 30, 5, 5, 6, 7, 8], 3)).toBe(5);
    expect(longestRunWithin([10, 11, 12, 30, 5, 9, 14], 3)).toBe(3);
    expect(longestRunWithin([5, 40, 6, 39], 3)).toBe(1);
  });
});

describe('replaceEmDashes', () => {
  it('replaces a parenthetical pair with commas', () => {
    const { text, emDashesReplaced } = replaceEmDashes('The event — which nobody expected — ran late.');
    expect(text).toBe('The event, which nobody expected, ran late.');
    expect(emDashesReplaced).toBe(2);
  });

  it('starts a new sentence when a capital follows', () => {
    expect(replaceEmDashes('He lost the set — Alcaraz served well.').text)
      .toBe('He lost the set. Alcaraz served well.');
  });

  it('handles a dash with no surrounding spaces', () => {
    expect(replaceEmDashes('tickets—which sold out—were cheap.').text)
      .toBe('tickets, which sold out, were cheap.');
  });

  it('converts a line-leading dash into a markdown bullet', () => {
    expect(replaceEmDashes('— first item\n— second item').text).toBe('- first item\n- second item');
  });

  it('converts an ASCII double hyphen', () => {
    expect(replaceEmDashes('The final -- held on Sunday -- ran long.').text)
      .toBe('The final, held on Sunday, ran long.');
  });

  it('never doubles punctuation when one already exists', () => {
    const { text } = replaceEmDashes('He arrived late, — and left early.');
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toBe('He arrived late, and left early.');
  });

  it('leaves correct numeric ranges untouched', () => {
    const input = 'The 2024–2026 editions ran October 15–18 each year.';
    const { text, emDashesReplaced } = replaceEmDashes(input);
    expect(text).toBe(input);
    expect(emDashesReplaced).toBe(0);
  });

  it('reports no change for text that was already clean', () => {
    expect(replaceEmDashes('A clean sentence, with commas.').changed).toBe(false);
  });
});

describe('sanitizeDraft', () => {
  it('strips a wrapping code fence and cleans dashes in one pass', () => {
    const { text, emDashesReplaced } = sanitizeDraft('```markdown\n# Title\n\nBody — with a dash.\n```');
    expect(text).toBe('# Title\n\nBody, with a dash.');
    expect(emDashesReplaced).toBe(1);
  });

  it('leaves a clean draft byte-identical', () => {
    const clean = '# Title\n\nA clean paragraph.\n\n## Section\n\nMore text.';
    expect(sanitizeDraft(clean).text).toBe(clean);
    expect(sanitizeDraft(clean).changed).toBe(false);
  });
});
