import { describe, expect, it } from 'vitest';
import { analyseSeo, countKeyphrase, passiveRatio, transitionRatio } from './analysis';
import { analyseDocument, pixelWidth, readability, splitSentences } from './text';

describe('text parsing', () => {
  it('counts headings by level and ignores fenced code', () => {
    const md = ['# Title', '', 'Intro para.', '', '## One', '', 'Body.', '', '```', '# not a heading', '```', '', '### Deep', '', '## Two'].join('\n');
    const stats = analyseDocument(md);
    expect(stats.headings.map((h) => h.text)).toEqual(['Title', 'One', 'Deep', 'Two']);
    expect(stats.h2).toBe(2);
    expect(stats.h3).toBe(1);
  });

  it('does not split sentences on abbreviations or decimals', () => {
    const s = splitSentences('Sinner won 6.2 sets vs. Alcaraz. Dr. Smith agreed. That was it.');
    expect(s).toHaveLength(3);
  });

  it('scores long dense prose as harder than short plain prose', () => {
    const plain = readability('The cat sat. The dog ran. We saw them.');
    const dense = readability(
      'Notwithstanding the aforementioned considerations, the institutional methodology demonstrably necessitates comprehensive reconceptualisation.',
    );
    expect(plain.ease).toBeGreaterThan(dense.ease);
    expect(dense.grade).toBeGreaterThan(plain.grade);
  });

  it('measures wide strings as wider than narrow ones of equal length', () => {
    expect(pixelWidth('mmmmmmmmmm')).toBeGreaterThan(pixelWidth('iiiiiiiiii'));
  });
});

describe('keyphrase and voice metrics', () => {
  it('matches whole keyphrases only', () => {
    expect(countKeyphrase('The six kings slam is here. Six Kings Slam again.', 'six kings slam')).toBe(2);
    expect(countKeyphrase('slamming the door', 'slam')).toBe(0);
  });

  it('detects regular and irregular passive constructions', () => {
    expect(passiveRatio(['The match was won by Sinner.'])).toBe(1);
    expect(passiveRatio(['The trophy was quickly awarded.'])).toBe(1);
    expect(passiveRatio(['Sinner won the match.'])).toBe(0);
  });

  it('counts transitions only near the start of a sentence', () => {
    expect(transitionRatio(['However, he lost.', 'Therefore we left.'])).toBe(1);
    expect(transitionRatio(['He played well and so did she.'])).toBe(0);
  });
});

describe('analyseSeo', () => {
  const body = [
    '# Semantic SEO Guide',
    '',
    'Semantic SEO is the practice of optimising for meaning. However, most guides stop at keywords.',
    '',
    '## What semantic SEO changes',
    '',
    'Therefore, entities matter more than strings. Moreover, search engines map meaning to vectors.',
    '',
    '## How to apply semantic SEO',
    '',
    'First, build an entity map. Additionally, link related pages. Consequently, topical authority grows.',
  ].join('\n');

  it('passes a well-formed article and reports usable stats', () => {
    const r = analyseSeo({
      markdown: body,
      title: '7 Proven Semantic SEO Tactics That Work',
      metaDescription:
        'Semantic SEO is the practice of optimising for meaning rather than strings. Learn the entity mapping tactics that build real topical authority fast.',
      focusKeyword: 'semantic SEO',
      slug: 'semantic-seo-tactics',
    });

    expect(r.keywordCount).toBeGreaterThan(0);
    expect(r.stats.h2).toBe(2);
    expect(r.checks.find((c) => c.id === 'title-keyword')?.status).toBe('good');
    expect(r.checks.find((c) => c.id === 'title-number')?.status).toBe('good');
    expect(r.checks.find((c) => c.id === 'title-power')?.status).toBe('good');
    expect(r.score).toBeGreaterThan(50);
  });

  it('flags a title that is too long, keyword-less and unpunchy', () => {
    const r = analyseSeo({
      markdown: body,
      title: 'An Extremely Long Meandering Headline About Nothing In Particular That Keeps Going Well Past The Limit',
      metaDescription: 'Short.',
      focusKeyword: 'semantic SEO',
    });

    expect(r.checks.find((c) => c.id === 'title-length')?.status).toBe('bad');
    expect(r.checks.find((c) => c.id === 'title-keyword')?.status).toBe('bad');
    expect(r.checks.find((c) => c.id === 'desc-length')?.status).toBe('warn');
    expect(r.problems).toBeGreaterThan(0);
  });

  it('treats keyword stuffing as a problem, not a win', () => {
    const stuffed = Array.from({ length: 40 }, () => 'semantic SEO is great.').join(' ');
    const r = analyseSeo({
      markdown: `# Semantic SEO\n\n${stuffed}`,
      title: 'Semantic SEO',
      metaDescription: 'Semantic SEO guide.',
      focusKeyword: 'semantic SEO',
    });
    expect(r.checks.find((c) => c.id === 'density')?.status).toBe('bad');
  });
});

/**
 * Regression guard built from the real failure: this article was generated on
 * 27 Sept 2026, three weeks before the 2026 event, yet framed the whole piece as
 * a 2024/2025 retrospective. Every conventional SEO check passed. The freshness
 * check is the one that must not.
 */
describe('freshness — the Six Kings Slam regression', () => {
  const staleArticle = [
    '# Six Kings Slam: 6 Facts About the Elite Tennis Showdown',
    '',
    'The Six Kings Slam stands among the most lucrative exhibition tennis events in world sports.',
    '',
    '## What Is the Six Kings Slam?',
    '',
    'Organizers launched the inaugural edition in 2024. Jannik Sinner won the first edition in October 2024.',
    '',
    '## The 2025 Six Kings Slam Player Lineup',
    '',
    'The matches took place from October 15 to October 18, 2025, drawing intense global media coverage.',
  ].join('\n');

  const generatedOn = new Date('2026-09-27T12:00:00Z');

  it('flags a time-bound article that never mentions the current year', () => {
    const r = analyseSeo({
      markdown: staleArticle,
      title: 'Six Kings Slam: 6 Facts About the Elite Tennis Showdown',
      metaDescription: 'The Six Kings Slam stands among the most lucrative exhibition tennis events in world sports, awarding millions to top competitors.',
      focusKeyword: 'six kings slam',
      now: generatedOn,
    });

    const fresh = r.checks.find((c) => c.id === 'freshness-current-year');
    expect(fresh?.status).toBe('bad');
    expect(fresh?.message).toContain('2025');
    expect(fresh?.message).toContain('2026');
    expect(fresh?.autoFixable).toBe(true);
  });

  it('passes the same topic once it is anchored to the current year', () => {
    const fixed = staleArticle.replace(
      '## The 2025 Six Kings Slam Player Lineup',
      '## The 2026 Six Kings Slam Player Lineup',
    );
    const r = analyseSeo({
      markdown: fixed,
      title: 'Six Kings Slam 2026: Dates, Players & How to Watch',
      metaDescription: 'Everything on the Six Kings Slam 2026: confirmed dates, the six-player field, ticket options and how to stream every match live.',
      focusKeyword: 'six kings slam',
      now: generatedOn,
    });

    expect(r.checks.find((c) => c.id === 'freshness-current-year')?.status).toBe('good');
  });

  it('does not impose freshness checks on evergreen topics', () => {
    const r = analyseSeo({
      markdown: '# How Photosynthesis Works\n\nPlants convert light into chemical energy through chlorophyll.',
      title: 'How Photosynthesis Works',
      metaDescription: 'A clear explanation of how plants convert light into chemical energy using chlorophyll and the Calvin cycle.',
      focusKeyword: 'photosynthesis',
      now: generatedOn,
    });
    expect(r.checks.some((c) => c.category === 'freshness')).toBe(false);
  });
});
