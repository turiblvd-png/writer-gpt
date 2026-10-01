import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const complete = vi.fn();
vi.mock('@/lib/ai', () => ({ complete: (...a: unknown[]) => complete(...a) }));
const reply = (text: string) => ({ text, sources: [], searchQueries: [], usage: { input: 1, output: 1, total: 2 }, model: 'm', provider: 'gemini' as const });

const BODY = 'Heat pumps move heat rather than make it. '.repeat(20);

beforeEach(() => {
  vi.resetModules();
  complete.mockReset();
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-soc-')), 'data.json');
});

describe('social posts', () => {
  it('cleans, links, measures and flags each platform', async () => {
    complete.mockResolvedValueOnce(reply(JSON.stringify({
      posts: [
        { platform: 'x', parts: ['A 3 kW unit heats 90 m² — here is why.', 'x'.repeat(300) + ' [LINK]'], hashtags: ['#heatpumps', 'home energy'] },
        { platform: 'linkedin', parts: ['Let us delve into heat pumps. [LINK]'], hashtags: ['a', 'b', 'c', 'd'] },
      ],
    })));
    const { generateSocialPosts, listSocialSets } = await import('./posts');
    const set = await generateSocialPosts({ text: BODY, title: 'Heat pumps', url: 'https://ex.com/a', platforms: ['x', 'linkedin', 'x'] });

    const x = set.posts.find((p) => p.platform === 'x')!;
    expect(x.parts[0]).not.toMatch(/—/);
    expect(x.parts[1]).toContain('https://ex.com/a');
    expect(x.hashtags).toEqual(['heatpumps', 'homeenergy']);
    expect(x.overLimit).toBe(true);

    const li = set.posts.find((p) => p.platform === 'linkedin')!;
    expect(li.hashtags).toHaveLength(3);
    expect(li.tells.length).toBeGreaterThan(0);
    expect(li.overLimit).toBe(false);
    expect((await listSocialSets())).toHaveLength(1);
  });

  it('refuses thin input and empty platform lists', async () => {
    const { generateSocialPosts } = await import('./posts');
    await expect(generateSocialPosts({ text: 'short', platforms: ['x'] })).rejects.toThrow(/paragraphs/);
    await expect(generateSocialPosts({ text: BODY, platforms: [] })).rejects.toThrow(/platform/);
    expect(complete).not.toHaveBeenCalled();
  });

  it('pulls the body from a saved article', async () => {
    complete.mockResolvedValueOnce(reply('{"posts":[{"platform":"facebook","parts":["Post"],"hashtags":[]}]}'));
    const { saveArticle } = await import('@/lib/db/store');
    await saveArticle({ id: 'a1', title: 'Saved', slug: 's', markdown: BODY, metaDescription: '', focusKeyword: '', keywords: [], language: 'English', seoMode: 'full-seo', wordCount: 160, status: 'draft', sources: [] });
    const { generateSocialPosts } = await import('./posts');
    const set = await generateSocialPosts({ articleId: 'a1', platforms: ['facebook'] });
    expect(set.title).toBe('Saved');
    expect(complete.mock.calls[0]![1].prompt).toContain('Heat pumps move heat');
  });
});
