import { collection, currentOwnerId } from '@/lib/db/engine';
import { currentActor } from '@/lib/auth/actor';
import { getArticle, saveArticle, type ArticleRecord } from '@/lib/db/store';
import { renderMarkdown } from '@/lib/content/render';
import { assertPublicUrl } from '@/lib/semantic/extract';

/**
 * Publishing to WordPress through its REST API with an Application Password
 * (Users → Profile → Application Passwords, built into WordPress since 5.6).
 *
 * Credentials come from environment variables when set (WP_URL, WP_USERNAME,
 * WP_APP_PASSWORD), which keeps them out of the database entirely. Otherwise
 * they can be saved from the Publishing page. The password is never sent back
 * to the browser. The site URL is user input fetched by the server, so it goes
 * through the same SSRF guard as competitor pages, and redirects are refused
 * rather than followed: a redirect on a POST would silently drop the body.
 */

export interface WpConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
  source: 'env' | 'saved';
}

export interface WpConfigView {
  siteUrl: string;
  username: string;
  source: 'env' | 'saved' | 'none';
  connected: boolean;
}

export class WordPressError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'WordPressError';
  }
}

type SavedConfig = { id: string; siteUrl: string; username: string; appPassword: string; updatedAt: number };
// Private per user: each subscriber connects their own site.
const settings = collection<SavedConfig>('wp_connections');
async function configId(): Promise<string> {
  return `wordpress-${(await currentOwnerId()) ?? 'site'}`;
}

/** WP_* environment variables belong to the site owner, never to subscribers. */
async function envAllowed(): Promise<boolean> {
  const actor = await currentActor();
  return !actor || actor.role === 'owner';
}
const TIMEOUT_MS = 20_000;

export function normaliseSiteUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = assertPublicUrl(withScheme);
  // Keep any subdirectory install path, drop query and hash.
  return `${url.origin}${url.pathname.replace(/\/+$/, '').replace(/\/wp-admin.*$|\/wp-json.*$/, '')}`;
}

export async function getWpConfig(): Promise<WpConfig | null> {
  const { WP_URL, WP_USERNAME, WP_APP_PASSWORD } = process.env;
  if (WP_URL && WP_USERNAME && WP_APP_PASSWORD && (await envAllowed())) {
    return { siteUrl: normaliseSiteUrl(WP_URL), username: WP_USERNAME, appPassword: WP_APP_PASSWORD, source: 'env' };
  }
  const saved = await settings.get(await configId());
  return saved ? { siteUrl: saved.siteUrl, username: saved.username, appPassword: saved.appPassword, source: 'saved' } : null;
}

export async function getWpConfigView(): Promise<WpConfigView> {
  const config = await getWpConfig();
  return config
    ? { siteUrl: config.siteUrl, username: config.username, source: config.source, connected: true }
    : { siteUrl: '', username: '', source: 'none', connected: false };
}

async function wpRequest<T>(config: Pick<WpConfig, 'siteUrl' | 'username' | 'appPassword'>, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const url = `${config.siteUrl}/wp-json${path}`;
  assertPublicUrl(url);
  const auth = Buffer.from(`${config.username}:${config.appPassword.replace(/\s+/g, '')}`).toString('base64');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new WordPressError(aborted ? 'WordPress did not answer within 20 seconds.' : `Could not reach ${config.siteUrl}.`, 502);
  } finally {
    clearTimeout(timer);
  }

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location') ?? '';
    const hint = location ? ` Use ${location.replace(/\/wp-json.*$/, '')} as the site address.` : '';
    throw new WordPressError(`The site redirected the request.${hint}`);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new WordPressError(
      res.ok
        ? 'The site did not return JSON. Check the address, and that the REST API is not blocked by a security plugin.'
        : `WordPress returned HTTP ${res.status}.`,
      502,
    );
  }

  if (!res.ok) {
    const code = (data as { code?: string })?.code ?? '';
    const message = (data as { message?: string })?.message ?? '';
    if (res.status === 401 || code === 'rest_not_logged_in' || code === 'incorrect_password' || code === 'invalid_username') {
      throw new WordPressError('WordPress rejected the login. Use your username and an Application Password, not your normal password.', 401);
    }
    if (res.status === 403 || code === 'rest_cannot_create') {
      throw new WordPressError('This user is not allowed to publish posts. Use an Editor or Administrator account.', 403);
    }
    if (res.status === 404) {
      throw new WordPressError('The WordPress REST API was not found at this address. Check the site URL.', 404);
    }
    throw new WordPressError(message ? `WordPress: ${message.replace(/<[^>]+>/g, '')}` : `WordPress returned HTTP ${res.status}.`, 502);
  }
  return data as T;
}

/** Confirms the credentials work and returns the account's display name. */
export async function testConnection(config: Pick<WpConfig, 'siteUrl' | 'username' | 'appPassword'>): Promise<string> {
  const me = await wpRequest<{ name?: string; capabilities?: Record<string, boolean> }>(config, '/wp/v2/users/me?context=edit');
  if (me.capabilities && !me.capabilities.publish_posts && !me.capabilities.edit_posts) {
    throw new WordPressError('This user cannot create posts. Use an Editor or Administrator account.', 403);
  }
  return me.name ?? config.username;
}

export async function saveWpConfig(input: { siteUrl: string; username: string; appPassword: string }): Promise<{ name: string; view: WpConfigView }> {
  if (process.env.WP_URL && (await envAllowed())) throw new WordPressError('WordPress is configured by environment variables. Change it in your hosting settings.');
  const config = { siteUrl: normaliseSiteUrl(input.siteUrl), username: input.username.trim(), appPassword: input.appPassword.trim() };
  if (!config.username || !config.appPassword) throw new WordPressError('Enter the username and Application Password.');
  const name = await testConnection(config);
  await settings.put({ id: await configId(), ...config, updatedAt: Date.now() });
  return { name, view: { siteUrl: config.siteUrl, username: config.username, source: 'saved', connected: true } };
}

export async function disconnectWp(): Promise<void> {
  await settings.remove(await configId());
}

/** WordPress shows the title itself, so the article's own H1 would appear twice. */
export function articleHtml(markdown: string): string {
  return renderMarkdown(markdown.replace(/^\s{0,3}#\s+.+\n+/, ''));
}

export type PublishStatus = 'draft' | 'publish' | 'future';

export interface PublishResult {
  article: ArticleRecord;
  postId: number;
  link: string;
  status: string;
  updated: boolean;
}

export async function publishArticle(articleId: string, opts: { status: PublishStatus; date?: string }): Promise<PublishResult> {
  const config = await getWpConfig();
  if (!config) throw new WordPressError('Connect your WordPress site on the Publishing page first.');
  const article = await getArticle(articleId);
  if (!article) throw new WordPressError('That article no longer exists.', 404);

  if (opts.status === 'future') {
    const when = opts.date ? new Date(opts.date) : null;
    if (!when || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new WordPressError('Pick a future date and time to schedule the post.');
    }
  }

  const body = {
    title: article.title,
    content: articleHtml(article.markdown),
    excerpt: article.metaDescription,
    slug: article.slug,
    status: opts.status,
    ...(opts.status === 'future' && opts.date ? { date_gmt: new Date(opts.date).toISOString().slice(0, 19) } : {}),
  };

  // Update the existing post rather than creating a duplicate on a re-publish.
  const updating = typeof article.wpPostId === 'number';
  const post = await wpRequest<{ id: number; link: string; status: string }>(
    config,
    updating ? `/wp/v2/posts/${article.wpPostId}` : '/wp/v2/posts',
    { method: 'POST', body },
  ).catch(async (err) => {
    // The post was deleted in WordPress: fall back to creating it again.
    if (updating && err instanceof WordPressError && err.status === 404) {
      return wpRequest<{ id: number; link: string; status: string }>(config, '/wp/v2/posts', { method: 'POST', body });
    }
    throw err;
  });

  const saved = await saveArticle({
    ...article,
    wpPostId: post.id,
    publishedUrl: post.link,
    status: post.status === 'publish' ? 'published' : article.status === 'published' ? 'published' : 'draft',
  });
  return { article: saved, postId: post.id, link: post.link, status: post.status, updated: updating };
}
