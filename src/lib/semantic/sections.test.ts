import { describe, expect, it } from 'vitest';
import { distribute, fixPartHeadings, planParts } from './sections';
import { buildMegaPrompt } from './megaprompt';
import { countPhrase, splitLongParagraphs } from './quality';
import { keywordTargets, splitKeywords } from './brief';
import { makeClock } from '@/lib/pipeline/engine';
import { emptyProjectData, type OutlineHeading, type SemanticProject } from './types';

const h = (level: number, text: string): OutlineHeading => ({ level, text });

/** The shape of the outline that timed out: 11 H2s and 36 H3s, 1,200 words requested. */
function bigProject(): SemanticProject {
  const outline: OutlineHeading[] = [h(1, 'Six Kings Slam 2026: Tickets, Dates and Format')];
  for (let i = 0; i < 11; i++) {
    outline.push(h(2, i === 9 ? 'Frequently Asked Questions' : i === 10 ? 'Sources' : i === 2 ? 'Ticket prices' : `Section ${i}`));
    if (i < 10) for (let j = 0; j < (i < 6 ? 4 : 3); j++) outline.push(h(3, `Detail ${i}.${j}`));
  }
  return {
    id: 'p', name: 'p', language: 'English', mainKeyword: 'Six kings Slam, Six Kings Slam Tickets',
    currentStepIndex: 0, completedSteps: [], createdAt: 0, updatedAt: 0,
    data: {
      ...emptyProjectData(),
      combinedOutline: outline,
      wordCount: { target: 1200, auto: true },
      entities: [
        { name: 'ANB Arena', source: 'competitor', documentFrequency: 3 },
        { name: 'Riyadh Season', source: 'competitor', documentFrequency: 2 },
        { name: 'Webook', source: 'competitor', documentFrequency: 1 },
        { name: 'Kevin Hart', source: 'competitor', documentFrequency: 3 },
      ],
      facts: {
        facts: [
          { id: '1', label: 'Venue', value: 'ANB Arena, Riyadh', status: 'confirmed' },
          { id: '2', label: 'Organiser', value: 'Riyadh Season', status: 'confirmed' },
          { id: '3', label: 'Ticket prices', value: 'from 150 SAR', status: 'reported' },
        ],
        sources: [], liveSearch: false, researchedAt: 0,
      },
    },
  };
}

describe('parallel part plan', () => {
  const project = bigProject();
  const plan = planParts(project);

  it('keeps every planned heading, once, in order', () => {
    expect(plan.parts.flatMap((p) => p.headings)).toEqual(plan.outline);
  });

  it('sizes parts so each answers well inside the time limit', () => {
    expect(plan.parts.length).toBeGreaterThanOrEqual(3);
    expect(plan.parts.length).toBeLessThanOrEqual(8);
    for (const p of plan.parts) expect(p.words).toBeLessThanOrEqual(900);
    const total = plan.parts.reduce((s, p) => s + p.words, 0);
    expect(Math.abs(total - plan.budget.effective)).toBeLessThan(plan.budget.effective * 0.1);
  });

  it('honours a big outline with tight sections, not a doubled article', () => {
    expect(plan.budget.effective).toBeLessThanOrEqual(2200);
  });

  it('puts the opening first and only there', () => {
    expect(plan.parts[0]!.opening).toBe(true);
    expect(plan.parts[0]!.headings[0]!.level).toBe(1);
    expect(plan.parts.slice(1).every((p) => !p.opening)).toBe(true);
    expect(plan.parts.at(-1)!.last).toBe(true);
  });

  it('assigns each connected entity to exactly one part, never unconnected ones', () => {
    const all = plan.parts.flatMap((p) => p.entities);
    expect(all.sort()).toEqual(['ANB Arena', 'Riyadh Season']);
  });

  it('gives every fact exactly one home, matched to its section', () => {
    expect(plan.parts.flatMap((p) => p.facts)).toHaveLength(3);
    const home = plan.parts.find((p) => p.facts.some((f) => f.startsWith('Ticket prices')))!;
    expect(home.headings.some((x) => x.text === 'Ticket prices')).toBe(true);
  });

  it('keeps no subheading over a fragment: at most one heading per ~220 words', () => {
    const faq = plan.outline.findIndex((x) => x.text === 'Frequently Asked Questions');
    const contentH3 = plan.outline.slice(0, faq).filter((x) => x.level === 3);
    expect(contentH3).toHaveLength(0);
    expect(plan.outline.find((x) => x.text === 'Section 0')!.covers).toHaveLength(4);
  });

  it('splits keyword ranges so the parts add up to the whole-article range', () => {
    const targets = keywordTargets(splitKeywords(project.mainKeyword), plan.budget.effective);
    targets.forEach((t, k) => {
      const min = plan.parts.reduce((s, p) => s + p.keywords[k]!.min, 0);
      const max = plan.parts.reduce((s, p) => s + p.keywords[k]!.max, 0);
      expect(min).toBeGreaterThanOrEqual(t.min);
      expect(max).toBeLessThanOrEqual(t.max + 1);
    });
  });

  it('changes its key when the outline changes', () => {
    const other = bigProject();
    other.data.combinedOutline = other.data.combinedOutline.slice(0, -3);
    expect(planParts(other).key).not.toBe(plan.key);
    expect(planParts(bigProject()).key).toBe(plan.key);
  });

  it('builds a part brief with shared rules first and only that part\'s headings to write', () => {
    const clock = makeClock(new Date('2026-10-01T12:00:00Z'));
    const part = plan.parts[1]!;
    const prompt = buildMegaPrompt(project, clock, { part: { part, plan } });
    const shared = buildMegaPrompt(project, clock, { part: { part: plan.parts[2]!, plan } });
    const tail = prompt.slice(prompt.indexOf('YOUR PART:'));
    for (const hd of part.headings) expect(tail).toContain(hd.text);
    expect(tail).not.toContain('Last updated');
    expect(prompt).toContain('FACTUAL LIMITS');
    // Same prefix for every part, so providers can cache it.
    const cut = prompt.indexOf('FULL ARTICLE OUTLINE');
    expect(shared.slice(0, cut)).toBe(prompt.slice(0, cut));
  });
});

describe('part clean-up', () => {
  const part = { index: 1, headings: [h(2, 'When Is It?'), h(3, 'Dates')], words: 200, opening: false, last: false, entities: [], facts: [], headingWords: [100, 100], keywords: [] };

  it('restores reworded headings and drops a preamble and stray H1', () => {
    const md = 'Here is your part:\n\n# Title again\n\n## When is it happening\n\nText.\n\n#### The dates\n\nMore.';
    const out = fixPartHeadings(md, part);
    expect(out.matched).toBe(true);
    expect(out.markdown).toBe('## When Is It?\n\nText.\n\n### Dates\n\nMore.');
  });

  it('reports a part that lost a heading', () => {
    expect(fixPartHeadings('## When Is It?\n\nText only.', part).matched).toBe(false);
  });

  it('splits long paragraphs at sentences and leaves lists alone', () => {
    const md = 'One is here. Two is here. Three is here. Four is here. Five is here.\n\n- a. b. c. d.';
    const out = splitLongParagraphs(md);
    expect(out.split('\n\n')).toHaveLength(3);
    expect(out).toContain('- a. b. c. d.');
  });

  it('distributes counts exactly', () => {
    expect(distribute(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(countPhrase('Six Kings Slam Tickets and Six Kings Slam', 'six kings slam')).toBe(2);
  });
});
