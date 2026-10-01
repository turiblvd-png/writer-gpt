import { randomUUID } from 'node:crypto';
import { complete } from '@/lib/ai';
import { extractJson } from '@/lib/content/json';
import { collection } from '@/lib/db/engine';
import { getArticle } from '@/lib/db/store';
import { makeClock } from '@/lib/pipeline/engine';
import { NATURAL_WRITING_RULES, bannedPhraseList } from '@/lib/style/rules';
import { replaceEmDashes } from '@/lib/style/sanitize';
import { PHRASE_TELLS } from '@/lib/style/patterns';
import { PLATFORMS, type Platform } from './platforms';

/**
 * Turns an article into platform-native posts.
 *
 * Each platform gets its own format rather than one blurb resized: a LinkedIn
 * post earns the "see more" click with its first two lines, an X thread needs
 * every post to stand alone under 280 characters, Instagram puts hashtags
 * last. Limits are measured after generation and shown to the user rather than
 * trusted.
 */

export { PLATFORMS, type Platform };

export interface SocialPost {
  platform: Platform;
  /** One entry per post; X threads have several. */
  parts: string[];
  hashtags: string[];
  /** Characters per part, hashtags included on the last part. */
  lengths: number[];
  overLimit: boolean;
  /** Stock AI phrases that slipped through, flagged for the user. */
  tells: string[];
}

export interface SocialSet {
  id: string;
  articleId: string | null;
  title: string;
  url: string;
  tone: string;
  posts: SocialPost[];
  createdAt: number;
}

const store = collection<SocialSet>('social_posts');

const FORMAT: Record<Platform, string> = {
  linkedin:
    'linkedin: one post of 120 to 220 words. The first two lines must make someone click "see more": a specific finding, number or contrarian point from the article, not a question. Short paragraphs of one or two sentences. End with one concrete question to the reader, then the link.',
  x:
    'x: a thread of 4 to 7 posts. Each post under 260 characters and readable alone. Post 1 states the most useful specific from the article. The last post carries the link. No "thread" emoji or "1/" numbering.',
  facebook:
    'facebook: one post of 60 to 120 words in a conversational voice, one clear takeaway, then the link.',
  instagram:
    'instagram: a caption of 80 to 150 words. Strong first line, line breaks between ideas, a call to save or share, and "link in bio" instead of a URL.',
};

export interface SocialInput {
  articleId?: string;
  title?: string;
  text?: string;
  url?: string;
  platforms: Platform[];
  tone?: string;
}

function clean(text: string): string {
  return replaceEmDashes(text).text.replace(/[ \t]+\n/g, '\n').trim();
}

function measure(platform: Platform, parts: string[], hashtags: string[]): Pick<SocialPost, 'lengths' | 'overLimit'> {
  const tagText = hashtags.map((h) => `#${h}`).join(' ');
  const lengths = parts.map((p, i) => p.length + (i === parts.length - 1 && tagText ? tagText.length + 2 : 0));
  return { lengths, overLimit: lengths.some((l) => l > PLATFORMS[platform].limit) };
}

export async function generateSocialPosts(input: SocialInput): Promise<SocialSet> {
  const platforms = [...new Set(input.platforms)].filter((p): p is Platform => p in PLATFORMS);
  if (!platforms.length) throw new Error('Pick at least one platform.');

  let title = input.title?.trim() ?? '';
  let body = input.text?.trim() ?? '';
  let articleId: string | null = null;
  if (input.articleId) {
    const article = await getArticle(input.articleId);
    if (!article) throw new Error('That article no longer exists.');
    articleId = article.id;
    title = article.title;
    body = article.markdown;
  }
  if (body.length < 200) throw new Error('Pick an article or paste at least a few paragraphs.');

  const url = input.url?.trim() ?? '';
  const tone = input.tone?.trim() || 'confident and helpful';
  const clock = makeClock();

  const result = await complete('draft', {
    json: true,
    temperature: 0.7,
    system: [
      `You write social posts for a brand that sounds like a knowledgeable person, not a marketing department. Today is ${clock.today}.`,
      NATURAL_WRITING_RULES,
    ].join('\n\n'),
    prompt: [
      `Write social posts promoting this article. Tone: ${tone}.`,
      `Link to use: ${url || '[LINK]'}`,
      '',
      'Formats:',
      ...platforms.map((p) => `- ${FORMAT[p]} Up to ${PLATFORMS[p].hashtags} hashtags, specific to the topic, never generic ones like #marketing or #success.`),
      '',
      'Rules:',
      '- Every post must carry a specific fact, number, name or tip taken from the article. No vague teasers.',
      '- Only use facts that appear in the article. Do not add statistics.',
      '- No emoji at the start of lines. At most one emoji per post, and none is fine.',
      `- Never use: ${bannedPhraseList()}.`,
      '- Never use an em dash.',
      '',
      'Return JSON only:',
      `{"posts":[{"platform":"${platforms[0]}","parts":["post text"],"hashtags":["tagWithoutHash"]}]}`,
      '',
      `ARTICLE TITLE: ${title || 'Untitled'}`,
      'ARTICLE:',
      body.slice(0, 24_000),
    ].join('\n'),
  });

  const parsed = extractJson<{ posts?: { platform?: string; parts?: unknown; hashtags?: unknown }[] }>(result.text);
  const posts: SocialPost[] = [];
  for (const platform of platforms) {
    const raw = parsed.posts?.find((p) => p.platform === platform);
    const parts = (Array.isArray(raw?.parts) ? raw.parts : [])
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map(clean)
      .map((p) => (url ? p.replaceAll('[LINK]', url) : p));
    if (!parts.length) continue;
    const hashtags = (Array.isArray(raw?.hashtags) ? raw.hashtags : [])
      .filter((h): h is string => typeof h === 'string')
      .map((h) => h.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''))
      .filter(Boolean)
      .slice(0, PLATFORMS[platform].hashtags);
    posts.push({ platform, parts, hashtags, ...measure(platform, parts, hashtags), tells: postTells(parts.join('\n')) });
  }
  if (!posts.length) throw new Error('The model returned no usable posts. Try again.');

  return store.put({ id: randomUUID(), articleId, title, url, tone, posts, createdAt: Date.now() });
}

/** Phrases from the detector that slipped into a post, for the UI to flag. */
export function postTells(text: string): string[] {
  // The shared patterns are global; a fresh copy avoids lastIndex carrying over between calls.
  return PHRASE_TELLS.filter((t) => t.severity !== 'minor' && new RegExp(t.pattern.source, 'i').test(text)).map((t) => t.label);
}

export async function listSocialSets(limit = 30): Promise<SocialSet[]> {
  return store.list('createdAt', limit);
}

export async function deleteSocialSet(id: string): Promise<void> {
  await store.remove(id);
}
