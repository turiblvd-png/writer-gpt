import { describe, expect, it } from 'vitest';
import { keywordTargets, lengthBudget, splitKeywords, usefulPairs, usefulPhrases, usefulTerms, withFaqQuestions } from './brief';
import { parseFactSheet } from './facts';
import { factSheetBlock } from './fact-block';
import type { OutlineHeading } from './types';

const h = (level: number, text: string): OutlineHeading => ({ level, text });

describe('brief planning', () => {
  it('splits a combined keyword and fixes half-capitalised phrases', () => {
    expect(splitKeywords('Six kings Slam, Six Kings Slam Tickets, six kings slam')).toEqual(['Six Kings Slam', 'Six Kings Slam Tickets']);
  });

  it('sets exact-match ranges, primary above secondary', () => {
    const [p, s] = keywordTargets(['Six Kings Slam', 'Six Kings Slam Tickets'], 2500);
    expect(p).toMatchObject({ primary: true });
    expect(p!.min).toBeGreaterThanOrEqual(10);
    expect(p!.max).toBeLessThanOrEqual(25);
    expect(s!.max).toBeLessThan(p!.min);
  });

  it('raises the length when the outline cannot fit the target', () => {
    const outline = [h(1, 'T'), ...Array.from({ length: 9 }, (_, i) => h(2, `H2 ${i}`)), ...Array.from({ length: 29 }, (_, i) => h(3, `H3 ${i}`))];
    const b = lengthBudget(outline, 1200);
    expect(b.raised).toBe(true);
    // A tight floor: a short answer per heading, not a doubled article.
    expect(b.minimum).toBeGreaterThanOrEqual(1500);
    expect(b.minimum).toBeLessThanOrEqual(1900);
    expect(b.perH3).toBeGreaterThanOrEqual(45);
    expect(lengthBudget(outline.slice(0, 8), 1200).raised).toBe(false);
  });

  it('gives each FAQ question its own H3', () => {
    const outline = [h(1, 'T'), h(2, 'Frequently Asked Questions'), h(3, 'Tickets and entry'), h(3, 'Watching'), h(2, 'Sources')];
    const out = withFaqQuestions(outline, ['When is it', 'Where is it?']);
    expect(out.map((x) => x.text)).toEqual(['T', 'Frequently Asked Questions', 'When is it?', 'Where is it?', 'Sources']);
  });

  it('drops generic words, stray years and phrases already covered', () => {
    const ngrams = [
      { text: 'kings slam', n: 2, count: 53, documents: 3 },
      { text: 'slam', n: 1, count: 60, documents: 3 },
      { text: 'first', n: 1, count: 7, documents: 3 },
      { text: 'tennis', n: 1, count: 49, documents: 3 },
    ];
    expect(usefulPhrases(ngrams, 2026).map((g) => g.text)).toEqual(['kings slam', 'tennis']);
    expect(usefulTerms([{ term: 'since', salience: 1, count: 1 }, { term: 'netflix', salience: 1, count: 1 }, { term: '2002', salience: 1, count: 1 }, { term: '2026', salience: 1, count: 1 }], 2026).map((t) => t.term)).toEqual(['netflix', '2026']);
    expect(usefulPairs([{ text: '2002 … since', count: 4, gap: 1 }, { text: 'alcaraz … sinner', count: 7, gap: 1 }], 2026).map((p) => p.text)).toEqual(['alcaraz … sinner']);
  });
});

describe('fact sheet', () => {
  const pages = ['https://example.com/guide'];
  it('keeps real citations, downgrades unsupported ones and never invents links', () => {
    const raw = JSON.stringify({
      facts: [
        { label: 'Venue', value: 'ANB Arena, Riyadh', status: 'confirmed', source: 'riyadhseason.com' },
        { label: 'Ticket price', value: 'From 500 SAR', status: 'reported', url: 'https://example.com/guide' },
        { label: 'Prize', value: '6 million USD', status: 'reported', url: 'https://made-up.example/' },
        { label: 'Bad', value: '' },
      ],
      sources: [{ name: 'Riyadh Season', url: 'https://fake.example/' }, { name: 'Example guide', url: 'https://example.com/guide' }],
    });
    const sheet = parseFactSheet(raw, pages, true);
    expect(sheet.facts.map((f) => [f.label, f.status, f.url ?? null])).toEqual([
      ['Venue', 'confirmed', null],
      ['Ticket price', 'reported', 'https://example.com/guide'],
      ['Prize', 'unconfirmed', null],
    ]);
    expect(sheet.sources).toEqual([{ name: 'Riyadh Season', url: undefined }, { name: 'Example guide', url: 'https://example.com/guide' }]);
  });

  it('cannot confirm anything without live search', () => {
    const sheet = parseFactSheet(JSON.stringify({ facts: [{ label: 'Venue', value: 'X', status: 'confirmed', url: pages[0] }] }), pages, false);
    expect(sheet.facts[0]!.status).toBe('reported');
    const block = factSheetBlock(sheet, { today: '1 October 2026', year: '2026' } as never).join('\n');
    expect(block).toMatch(/REPORTED by ranking pages only/);
    expect(block).toMatch(/Live search was unavailable/);
    expect(block).not.toMatch(/—/);
  });
});

describe('fact sheet from competitor pages', () => {
  const pages = ['https://a.example/x', 'https://b.example/y'];
  it('confirms what pages agree on and attributes the rest', () => {
    const raw = JSON.stringify({ facts: [
      { label: 'Venue', value: 'ANB Arena', status: 'confirmed', source: 'a.example, b.example', url: 'https://a.example/x' },
      { label: 'Dates', value: '15-18 October', status: 'confirmed', source: 'a.example' },
      { label: 'Prize', value: '6 million USD', status: 'reported', url: 'https://b.example/y' },
    ] });
    const sheet = parseFactSheet(raw, pages, 'pages');
    expect(sheet.method).toBe('pages');
    expect(sheet.facts.map((f) => f.status)).toEqual(['confirmed', 'unconfirmed', 'reported']);
    const block = factSheetBlock(sheet, { today: '1 October 2026', year: '2026' } as never).join('\n');
    expect(block).toMatch(/CONFIRMED \(ranking pages agree\)/);
    expect(block).not.toMatch(/Live search was unavailable/);
  });
});
