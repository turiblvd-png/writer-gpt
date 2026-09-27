import { describe, expect, it } from 'vitest';
import { buildMegaPrompt, reviewSummary, reviewWarnings } from './megaprompt';
import { makeClock } from '@/lib/pipeline/engine';
import { emptyProjectData, type SemanticProject } from './types';

const clock = makeClock(new Date('2026-09-27T12:00:00Z'));

function project(overrides: Partial<SemanticProject['data']> = {}): SemanticProject {
  return {
    id: 'p1', name: 'Six Kings', language: 'English', mainKeyword: 'six kings slam',
    currentStepIndex: 0, completedSteps: [], createdAt: 0, updatedAt: 0,
    data: { ...emptyProjectData(), ...overrides },
  };
}

describe('buildMegaPrompt', () => {
  it('always anchors the date and the factual limits', () => {
    const prompt = buildMegaPrompt(project(), clock);
    expect(prompt).toContain('27 September 2026');
    expect(prompt).toContain('current year is 2026');
    expect(prompt).toContain('FACTUAL LIMITS');
    expect(prompt).toContain('Your training data is older than that');
  });

  it('splits entities into required and optional by competitor document frequency', () => {
    const prompt = buildMegaPrompt(project({
      entities: [
        { name: 'ATP Tour', source: 'competitor', documentFrequency: 3 },
        { name: 'Riyadh Season', source: 'competitor', documentFrequency: 2 },
        { name: 'GreenSet Worldwide', source: 'unique', documentFrequency: 0 },
      ],
    }), clock);

    const required = prompt.slice(prompt.indexOf('REQUIRED'), prompt.indexOf('WORTH INCLUDING'));
    expect(required).toContain('ATP Tour');
    expect(required).toContain('Riyadh Season');
    expect(required).not.toContain('GreenSet');
    expect(prompt.slice(prompt.indexOf('WORTH INCLUDING'))).toContain('GreenSet Worldwide');
  });

  it('omits every item the user excluded', () => {
    const prompt = buildMegaPrompt(project({
      entities: [{ name: 'Wikipedia', source: 'competitor' }, { name: 'ATP Tour', source: 'ai' }],
      excludedEntities: ['wikipedia'],
      ngrams: [
        { text: 'exhibition tennis tournament', n: 3, count: 9, documents: 3 },
        { text: 'cookie policy', n: 2, count: 4, documents: 2 },
      ],
      excludedNgrams: ['cookie policy'],
      nlpKeywords: [{ term: 'riyadh', salience: 3, count: 8 }, { term: 'newsletter', salience: 1, count: 3 }],
      excludedKeywords: ['newsletter'],
    }), clock);

    expect(prompt).toContain('ATP Tour');
    expect(prompt).not.toContain('Wikipedia');
    expect(prompt).toContain('exhibition tennis tournament');
    expect(prompt).not.toContain('cookie policy');
    expect(prompt).toContain('riyadh');
    expect(prompt).not.toContain('newsletter');
  });

  it('matches exclusions case-insensitively', () => {
    const prompt = buildMegaPrompt(project({
      entities: [{ name: 'Netflix', source: 'competitor' }],
      excludedEntities: ['NETFLIX'],
    }), clock);
    expect(prompt).not.toContain('Netflix');
  });

  it('emits the outline as markdown headings in order', () => {
    const prompt = buildMegaPrompt(project({
      combinedOutline: [
        { level: 1, text: 'Six Kings Slam 2026' },
        { level: 2, text: 'Dates and schedule' },
        { level: 3, text: 'Rest day' },
      ],
    }), clock);
    expect(prompt).toContain('# Six Kings Slam 2026');
    expect(prompt).toContain('## Dates and schedule');
    expect(prompt).toContain('### Rest day');
  });

  it('subordinates SEO targets to the reader', () => {
    const prompt = buildMegaPrompt(project(), clock);
    expect(prompt.indexOf('WRITE FOR THE READER FIRST')).toBeGreaterThan(prompt.indexOf('SEO TARGETS'));
    expect(prompt).toContain('If hitting a keyword target makes a sentence worse, the sentence wins');
  });

  it('carries the shared house style, including the em dash ban', () => {
    const prompt = buildMegaPrompt(project(), clock);
    expect(prompt).toContain('Never use an em dash');
    expect(prompt).toContain('delve into');
    expect(prompt).toContain('BUILT TO BE QUOTED BY SEARCH AND AI ANSWERS');
    expect(prompt).toContain("PARSEABLE BY GOOGLE'S NATURAL LANGUAGE API");
    // Rewrites must beat their sources rather than echo them.
    expect(prompt).toContain('OUTRANK THE SOURCES');
    // Factual limits come last so they are the freshest instruction.
    expect(prompt.indexOf('FACTUAL LIMITS')).toBeGreaterThan(prompt.indexOf('WRITE FOR THE READER FIRST'));
  });

  it('caps injected items so the brief stays usable', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ text: `phrase ${i}`, n: 2, count: 5, documents: 3 }));
    const prompt = buildMegaPrompt(project({ ngrams: many }), clock, { maxNgrams: 5 });
    expect(prompt).toContain('"phrase 0"');
    expect(prompt).not.toContain('"phrase 6"');
  });

  it('leaves out sections that have no data rather than printing empty headings', () => {
    const prompt = buildMegaPrompt(project(), clock);
    expect(prompt).not.toContain('ENTITY COVERAGE');
    expect(prompt).not.toContain('CONCEPT RELATIONSHIPS');
  });
});

describe('reviewWarnings', () => {
  it('blocks generation when there is no outline or no competitors', () => {
    const { blocking } = reviewWarnings(project());
    expect(blocking).toHaveLength(2);
    expect(blocking.join(' ')).toMatch(/competitor URLs/i);
    expect(blocking.join(' ')).toMatch(/No outline/i);
  });

  it('allows generation with an outline but still advises on thin inputs', () => {
    const p = project({
      competitors: [{ url: 'https://a.com', domain: 'a.com' }],
      combinedOutline: [{ level: 2, text: 'A section' }],
    });
    const { blocking, advisory } = reviewWarnings(p);
    expect(blocking).toEqual([]);
    expect(advisory.join(' ')).toMatch(/No competitor content/i);
    expect(advisory.join(' ')).toMatch(/No entities/i);
  });

  it('flags a corpus too small for reliable phrase statistics', () => {
    const p = project({
      competitors: [{ url: 'https://a.com', domain: 'a.com' }],
      combinedOutline: [{ level: 2, text: 'A' }],
      competitorContent: [{ url: 'https://a.com', domain: 'a.com', text: 'x', words: 300 }],
    });
    expect(reviewWarnings(p).advisory.join(' ')).toMatch(/300 words/);
  });
});

describe('reviewSummary', () => {
  it('discounts excluded items and failed extractions', () => {
    const s = reviewSummary(project({
      competitors: [{ url: 'a', domain: 'a' }, { url: 'b', domain: 'b' }],
      competitorContent: [
        { url: 'a', domain: 'a', text: 'words here', words: 900 },
        { url: 'b', domain: 'b', text: '', words: 0, error: 'HTTP 403' },
      ],
      entities: [{ name: 'X', source: 'ai' }, { name: 'Y', source: 'ai' }],
      excludedEntities: ['X'],
    }));

    expect(s.competitors).toBe(2);
    expect(s.contentExtracted).toBe(1);
    expect(s.corpusWords).toBe(900);
    expect(s.entities).toBe(1);
  });
});
