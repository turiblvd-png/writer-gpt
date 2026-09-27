import { describe, expect, it } from 'vitest';
import { buildSchema, extractFaqs } from './schema';
import type { ArticleRecord } from '@/lib/db/store';

const article = (markdown: string): ArticleRecord => ({
  id: 'a1', title: 'Six Kings Slam 2026', slug: 'six-kings-slam-2026', markdown,
  metaDescription: 'Dates, players and how to watch.', focusKeyword: 'six kings slam',
  keywords: ['six kings slam', 'tennis'], language: 'English', seoMode: 'full-seo',
  wordCount: 1751, status: 'draft', sources: [{ uri: 'https://example.com/a', title: 'Source A' }],
  createdAt: 1759000000000, updatedAt: 1759000000000,
});

describe('extractFaqs', () => {
  it('pairs question headings with the prose that follows', () => {
    const faqs = extractFaqs([
      '## Who won in 2025?', '', 'Jannik Sinner defeated Carlos Alcaraz in the final, taking it 6-2, 6-4.',
      '', '## Where does it take place?', '', 'The tournament is staged in Riyadh, Saudi Arabia each October.',
    ].join('\n'));

    expect(faqs).toHaveLength(2);
    expect(faqs[0]!.question).toBe('Who won in 2025?');
    expect(faqs[0]!.answer).toContain('Jannik Sinner');
    expect(faqs[0]!.answer).not.toContain('Where does it');
  });

  it('ignores non-question headings and stub answers', () => {
    expect(extractFaqs('## Background\n\nSome long prose about the event history here.')).toHaveLength(0);
    expect(extractFaqs('## What is it?\n\nShort.')).toHaveLength(0);
  });
});

describe('buildSchema', () => {
  it('emits an Article node with citations', () => {
    const json = JSON.parse(buildSchema(article('# T\n\nBody text that is long enough to matter here.')));
    const node = json['@graph'][0];
    expect(node['@type']).toBe('Article');
    expect(node.wordCount).toBe(1751);
    expect(node.citation[0].url).toBe('https://example.com/a');
  });

  it('adds an FAQPage node only when there are at least two real Q&As', () => {
    const withFaq = JSON.parse(buildSchema(article([
      '## Who won?', '', 'Sinner won the final in straight sets against Alcaraz this year.',
      '', '## Where is it?', '', 'It takes place in Riyadh, Saudi Arabia during the autumn season.',
    ].join('\n'))));
    expect(withFaq['@graph'].map((n: { '@type': string }) => n['@type'])).toEqual(['Article', 'FAQPage']);
    expect(withFaq['@graph'][1].mainEntity).toHaveLength(2);

    const without = JSON.parse(buildSchema(article('## Overview\n\nPlain prose with no questions at all in it.')));
    expect(without['@graph']).toHaveLength(1);
  });
});
