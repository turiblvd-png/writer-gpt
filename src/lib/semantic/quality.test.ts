import { describe, expect, it } from 'vitest';
import { assessArticle, longParagraphs, revisionInstructions } from './quality';
import type { SemanticProject } from './types';

function project(): SemanticProject {
  return {
    id: 'p', name: 'p', language: 'English', mainKeyword: 'Heat pump, heat pump cost', currentStepIndex: 0, completedSteps: [],
    createdAt: 0, updatedAt: 0,
    data: {
      competitors: [], outlines: [], competitorContent: [], ngrams: [], nlpKeywords: [], skipGrams: [], excludedEntities: [], excludedNgrams: [], excludedKeywords: [],
      combinedOutline: [{ level: 1, text: 'Heat pump guide' }, { level: 2, text: 'What does a heat pump cost?' }, { level: 2, text: 'Daikin vs Mitsubishi Electric' }, { level: 2, text: 'FAQ' }],
      wordCount: { target: 300, auto: false },
      entities: [{ name: 'Daikin', source: 'competitor', documentFrequency: 3 }, { name: 'Mitsubishi Electric', source: 'competitor', documentFrequency: 2 }],
      autoSuggest: [], selectedQuestions: ['How long does a heat pump last'],
      grammar: { tone: 'x', pointOfView: 'second-person', readingLevel: 'x', sentenceVariety: true, avoidPhrases: [] },
      seoRules: { targetKeywordDensity: 1, minTransitionRatio: 0, maxPassiveRatio: 2, includeFaq: true, includeTables: true, includeKeyTakeaways: true, internalLinks: '', externalLinksPolicy: 'cite-sources' },
      aiInstructions: '',
    },
  };
}

describe('brief self-check', () => {
  it('finds long paragraphs but ignores lists and tables', () => {
    const md = 'One. Two. Three. Four.\n\n- a\n- b\n\n| a | b |\n|---|---|\n\nShort one.';
    expect(longParagraphs(md)).toHaveLength(1);
  });

  it('reports missing headings, entities, dashes and an off-target keyword', () => {
    const md = '# Heat pump guide\n\nA heat pump moves heat — it does not make it. Daikin makes them.\n\n## What does a heat pump cost?\n\nThe heat pump cost varies.';
    const r = assessArticle(project(), md);
    const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]));
    expect(byId.headings!.ok).toBe(false);
    expect(byId.headings!.detail).toMatch(/How long does a heat pump last\?/);
    expect(byId.entities!.detail).toMatch(/Mitsubishi Electric/);
    expect(byId.style!.ok).toBe(false);
    expect(byId.opening!.ok).toBe(false);
    expect(r.passed).toBeLessThan(r.total);
    expect(revisionInstructions(r).join('\n')).toMatch(/Restore the exact headings/);
  });
});

describe('keyword check', () => {
  it('counts the keyword in body text only, not in outline headings', () => {
    const headings = Array.from({ length: 10 }, (_, i) => `## Heat pump question ${i}\n\nA short answer about installers and costs here.`).join('\n\n');
    const r = assessArticle(project(), `# Heat pump guide\n\n${headings}`);
    const kw = r.checks.find((c) => c.id.startsWith('keyword:'))!;
    expect(kw.detail).toMatch(/^0 times in the body text/);
  });
});
