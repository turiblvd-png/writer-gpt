import { parse, type HTMLElement } from 'node-html-parser';
import type { CompetitorContent, CompetitorOutline, OutlineHeading } from './types';
import { safeDomain } from './url';

/**
 * Fetches a competitor page and pulls out its heading structure and body text.
 *
 * These URLs come from user input and are fetched by the server, so this is an
 * SSRF surface: without guards, a URL like http://169.254.169.254/ would make
 * the server read its own cloud metadata and hand it back in the UI. Hence the
 * scheme allow-list, private-range block, redirect cap and response size limit.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const UA =
  'Mozilla/5.0 (compatible; WriterGPT/0.1; +https://writer-gpt.com/bot) AppleWebKit/537.36 Chrome/120 Safari/537.36';

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'UnsafeUrlError';
  }
}

/** Hostnames and IP literals that must never be fetched server-side. */
function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs can be fetched.');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new UnsafeUrlError('Refusing to fetch a local address.');
  }

  // IPv4 literals in private, loopback, link-local and CGNAT ranges.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const blocked =
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||          // link-local, incl. cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224;
    if (blocked) throw new UnsafeUrlError('Refusing to fetch a private network address.');
  }

  // IPv6 loopback, unique-local and link-local.
  if (host === '::1' || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) {
    throw new UnsafeUrlError('Refusing to fetch a private network address.');
  }

  return url;
}

async function fetchHtml(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
  let current = assertPublicUrl(rawUrl).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(current, {
        // Follow redirects manually so each hop is re-validated; an open
        // redirect on a public host could otherwise land on a private one.
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timed out after ${FETCH_TIMEOUT_MS / 1000}s.`);
      }
      throw new Error(err instanceof Error ? err.message : 'Request failed.');
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`Redirect with no location (${res.status}).`);
      current = assertPublicUrl(new URL(location, current).toString()).toString();
      continue;
    }

    if (!res.ok) throw new Error(`Returned HTTP ${res.status}.`);

    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html') && !type.includes('xml') && type !== '') {
      throw new Error(`Not an HTML page (${type.split(';')[0]}).`);
    }

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error('Page is too large to parse.');

    const html = await readCapped(res);
    return { html, finalUrl: current };
  }
  throw new Error('Too many redirects.');
}

/** Read the body but stop once the cap is hit, so a huge page cannot exhaust memory. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join('');
}

/** Elements that never contain article prose. */
const CHROME = 'script,style,noscript,nav,header,footer,aside,form,iframe,svg,button,figure figcaption';

function cleanRoot(html: string): HTMLElement {
  const root = parse(html, { blockTextElements: { script: false, noscript: false, style: false } });
  root.querySelectorAll(CHROME).forEach((el) => el.remove());
  return root;
}

/**
 * Prefer the semantic content container. Extracting from <body> pulls in nav
 * links and cookie banners, which poison n-gram counts with site chrome.
 */
function contentRoot(root: HTMLElement): HTMLElement {
  for (const selector of ['article', 'main', '[role="main"]', '.post-content', '.entry-content', '#content']) {
    const found = root.querySelector(selector);
    if (found && found.structuredText.trim().length > 400) return found;
  }
  return root;
}

export async function extractOutline(rawUrl: string): Promise<CompetitorOutline> {
  const domain = safeDomain(rawUrl);
  try {
    const { html } = await fetchHtml(rawUrl);
    const root = contentRoot(cleanRoot(html));

    const headings: OutlineHeading[] = root
      .querySelectorAll('h1,h2,h3,h4,h5,h6')
      .map((el) => ({
        level: Number(el.rawTagName.slice(1)),
        text: collapse(el.structuredText || el.text),
      }))
      .filter((h) => h.text.length > 1 && h.text.length < 220);

    return { url: rawUrl, domain, headings: dedupeHeadings(headings) };
  } catch (err) {
    return { url: rawUrl, domain, headings: [], error: message(err) };
  }
}

export async function extractContent(rawUrl: string): Promise<CompetitorContent> {
  const domain = safeDomain(rawUrl);
  try {
    const { html } = await fetchHtml(rawUrl);
    const root = contentRoot(cleanRoot(html));

    const blocks = root
      .querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote')
      .map((el) => collapse(el.structuredText || el.text))
      // Drop nav crumbs and one-word cells that survive the chrome strip.
      .filter((t) => t.length > 25);

    const text = [...new Set(blocks)].join('\n');
    const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

    if (words < 50) {
      return { url: rawUrl, domain, text: '', words: 0, error: 'Page had no extractable article text (likely JS-rendered).' };
    }
    return { url: rawUrl, domain, text, words };
  } catch (err) {
    return { url: rawUrl, domain, text: '', words: 0, error: message(err) };
  }
}

export { safeDomain } from './url';

function dedupeHeadings(headings: OutlineHeading[]): OutlineHeading[] {
  const seen = new Set<string>();
  return headings.filter((h) => {
    const key = `${h.level}|${h.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export { assertPublicUrl };

export interface ExtractedPage {
  url: string;
  domain: string;
  title: string;
  metaDescription: string;
  /** Article body as markdown: headings, paragraphs, list items, tables flattened. */
  markdown: string;
  words: number;
  /** Outbound links found in the article body, for the audit's link check. */
  links: { href: string; text: string; internal: boolean }[];
  images: { src: string; alt: string }[];
  error?: string;
}

/**
 * Pure HTML → page conversion, kept separate from fetching so it can be tested
 * without the network. The head is read before chrome is stripped, because the
 * title and meta description live there and are what search results show.
 */
export function htmlToPage(html: string, url: string): ExtractedPage {
  const domain = safeDomain(url);
  const raw = parse(html);
  const title = collapse(raw.querySelector('title')?.text ?? '');
  const metaDescription = collapse(
    raw.querySelector('meta[name="description"]')?.getAttribute('content') ??
      raw.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
      '',
  );

  const root = contentRoot(cleanRoot(html));
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const el of root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote')) {
    const text = collapse(el.structuredText || el.text);
    if (!text || seen.has(text)) continue;
    const tag = el.rawTagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      if (text.length > 220) continue;
      lines.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
    } else if (tag === 'li') {
      if (text.length < 3) continue;
      lines.push(`- ${text}`);
    } else {
      if (text.length < 20) continue;
      lines.push(text);
    }
    seen.add(text);
  }

  const markdown = lines.join('\n\n');
  const words = (markdown.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

  const links = root.querySelectorAll('a[href]').flatMap((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return [];
    try {
      const abs = new URL(href, url);
      return [{ href: abs.toString(), text: collapse(a.text).slice(0, 120), internal: safeDomain(abs.toString()) === domain }];
    } catch {
      return [];
    }
  });

  const images = root.querySelectorAll('img').map((img) => ({
    src: img.getAttribute('src') ?? '',
    alt: collapse(img.getAttribute('alt') ?? ''),
  })).filter((i) => i.src);

  return { url, domain, title, metaDescription, markdown, words, links, images };
}

export async function extractPage(rawUrl: string): Promise<ExtractedPage> {
  try {
    const { html, finalUrl } = await fetchHtml(rawUrl);
    const page = htmlToPage(html, finalUrl);
    if (page.words < 50) {
      return { ...page, error: 'Page had no extractable article text. It may be rendered by JavaScript in the browser.' };
    }
    return page;
  } catch (err) {
    return {
      url: rawUrl, domain: safeDomain(rawUrl), title: '', metaDescription: '', markdown: '', words: 0,
      links: [], images: [], error: message(err),
    };
  }
}
