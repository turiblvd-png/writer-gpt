import { describe, expect, it } from 'vitest';
import { buildReport } from './summary';
import type { ArticleRecord } from '@/lib/db/store';

const now = new Date('2026-10-01T12:00:00Z'); // a Thursday
const day = 86_400_000;

const article = (id: string, createdAt: number, markdown: string, status: ArticleRecord['status'] = 'draft'): ArticleRecord => ({
  id, title: `Title ${id}`, slug: id, markdown, metaDescription: '', focusKeyword: '', keywords: [], language: 'English',
  seoMode: 'full-seo', wordCount: 500, status, sources: [], createdAt, updatedAt: createdAt,
});

describe('reports', () => {
  it('totals, buckets by week and tracks visibility per domain', () => {
    const report = buildReport({
      articles: [
        article('a', now.getTime(), '# A\n\nPlain text here. It is short.', 'published'),
        article('b', now.getTime() - 8 * day, '# B\n\nLet us delve into it — the rich tapestry.'),
        article('old', now.getTime() - 200 * day, '# Old\n\nText.'),
      ],
      humanized: [{ words: 300, scoreBefore: 40, scoreAfter: 90, createdAt: now.getTime() }],
      rewrites: [{ words: 200, similarityToSource: 0.1, createdAt: now.getTime() - day }],
      semanticProjects: 2, audits: 1, keywordResearch: 3, socialSets: 0, autopilotWritten: 1,
      visibility: [
        { domain: 'ex.com', citationRate: 0.2, createdAt: 1 },
        { domain: 'ex.com', citationRate: 0.5, createdAt: 2 },
      ] as never,
      now,
    });

    expect(report.totals.articles).toBe(3);
    expect(report.totals.published).toBe(1);
    expect(report.weekly).toHaveLength(8);
    expect(report.weekly.at(-1)).toEqual({ week: '2026-09-28', words: 1000, items: 3 });
    expect(report.weekly.at(-2)!.words).toBe(500);
    expect(report.weekly.reduce((s, w) => s + w.items, 0)).toBe(4);
    expect(report.quality.humanizerUplift).toBe(50);
    expect(report.quality.dashFreeShare).toBe(67);
    expect(report.visibility).toEqual([{ domain: 'ex.com', latest: 0.5, previous: 0.2, checks: 2 }]);
    expect(report.weakest[0]!.id).toBe('b');
  });

  it('reports nothing rather than zero when there is no data', () => {
    const r = buildReport({ articles: [], humanized: [], rewrites: [], semanticProjects: 0, audits: 0, keywordResearch: 0, visibility: [], socialSets: 0, autopilotWritten: 0, now });
    expect(r.quality.avgSeo).toBeNull();
    expect(r.quality.dashFreeShare).toBeNull();
    expect(r.weakest).toEqual([]);
  });
});
