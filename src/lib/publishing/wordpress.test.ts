import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const fetchMock = vi.fn();
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.WP_URL;
  delete process.env.WP_USERNAME;
  delete process.env.WP_APP_PASSWORD;
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-wp-')), 'data.json');
});
afterEach(() => vi.unstubAllGlobals());

async function seedArticle(extra: Record<string, unknown> = {}) {
  const { saveArticle } = await import('@/lib/db/store');
  return saveArticle({
    id: 'a1', title: 'Heat Pumps Explained', slug: 'heat-pumps-explained', markdown: '# Heat Pumps Explained\n\nBody <b>text</b>.\n\n## Costs\n\nAbout 9,000.',
    metaDescription: 'What a heat pump costs.', focusKeyword: 'heat pump', keywords: [], language: 'English', seoMode: 'full-seo',
    wordCount: 8, status: 'draft', sources: [], ...extra,
  });
}

describe('WordPress publishing', () => {
  it('normalises site addresses and blocks private ones', async () => {
    const { normaliseSiteUrl } = await import('./wordpress');
    expect(normaliseSiteUrl('example.com/')).toBe('https://example.com');
    expect(normaliseSiteUrl('https://example.com/blog/wp-admin/')).toBe('https://example.com/blog');
    expect(() => normaliseSiteUrl('http://127.0.0.1')).toThrow();
    expect(() => normaliseSiteUrl('http://169.254.169.254')).toThrow();
  });

  it('tests the login before saving and never exposes the password', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { name: 'Ada', capabilities: { publish_posts: true } }));
    const { saveWpConfig, getWpConfigView } = await import('./wordpress');
    const { name, view } = await saveWpConfig({ siteUrl: 'example.com', username: 'ada', appPassword: 'abcd efgh ijkl' });
    expect(name).toBe('Ada');
    expect(JSON.stringify(view)).not.toContain('abcd');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://example.com/wp-json/wp/v2/users/me?context=edit');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('ada:abcdefghijkl').toString('base64')}`);
    expect((await getWpConfigView()).connected).toBe(true);
  });

  it('explains a rejected login in plain words and saves nothing', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { code: 'incorrect_password', message: 'bad' }));
    const { saveWpConfig, getWpConfigView } = await import('./wordpress');
    await expect(saveWpConfig({ siteUrl: 'example.com', username: 'ada', appPassword: 'x' })).rejects.toThrow(/Application Password/);
    expect((await getWpConfigView()).connected).toBe(false);
  });

  it('refuses to follow redirects and suggests the right address', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://www.example.com/wp-json/wp/v2/users/me' } }));
    const { testConnection } = await import('./wordpress');
    await expect(testConnection({ siteUrl: 'https://example.com', username: 'a', appPassword: 'b' })).rejects.toThrow(/www\.example\.com/);
  });

  it('publishes without the duplicate H1, then updates the same post', async () => {
    process.env.WP_URL = 'https://example.com';
    process.env.WP_USERNAME = 'ada';
    process.env.WP_APP_PASSWORD = 'secret';
    await seedArticle();
    fetchMock
      .mockResolvedValueOnce(json(201, { id: 42, link: 'https://example.com/heat-pumps-explained/', status: 'publish' }))
      .mockResolvedValueOnce(json(200, { id: 42, link: 'https://example.com/heat-pumps-explained/', status: 'publish' }));
    const { publishArticle } = await import('./wordpress');

    const first = await publishArticle('a1', { status: 'publish' });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://example.com/wp-json/wp/v2/posts');
    expect(body.content).not.toContain('<h1');
    expect(body.content).not.toContain('<b>');
    expect(body.excerpt).toBe('What a heat pump costs.');
    expect(first.article.status).toBe('published');
    expect(first.article.publishedUrl).toContain('heat-pumps-explained');

    const second = await publishArticle('a1', { status: 'publish' });
    expect(fetchMock.mock.calls[1]![0]).toBe('https://example.com/wp-json/wp/v2/posts/42');
    expect(second.updated).toBe(true);
  });

  it('rejects scheduling in the past', async () => {
    process.env.WP_URL = 'https://example.com';
    process.env.WP_USERNAME = 'ada';
    process.env.WP_APP_PASSWORD = 'secret';
    await seedArticle();
    const { publishArticle } = await import('./wordpress');
    await expect(publishArticle('a1', { status: 'future', date: '2001-01-01T00:00' })).rejects.toThrow(/future/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
