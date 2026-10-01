import { randomUUID } from 'node:crypto';
import { saveArticle, type ArticleRecord } from '@/lib/db/store';
import { slugify } from './slug';
import { analyseDocument } from '@/lib/seo/text';
import type { RunSnapshot } from '@/lib/pipeline/types';
import type { GenerateState } from './types';
import type { Source } from '@/lib/ai';

/** Saves a finished Generate Content run to the library. */
export async function persistGeneratedArticle(snapshot: RunSnapshot<GenerateState>): Promise<ArticleRecord | null> {
  const { markdown, meta, input } = snapshot.state;
  if (!markdown) return null;

  const title = meta?.seoTitle || /^\s{0,3}#\s+(.+)$/m.exec(markdown)?.[1]?.trim() || input.topic;

  return saveArticle({
    id: randomUUID(),
    title,
    slug: meta?.slug || slugify(title),
    markdown,
    metaDescription: meta?.metaDescription ?? '',
    focusKeyword: meta?.focusKeyword ?? '',
    keywords: meta?.keywords ?? [],
    language: input.language,
    seoMode: input.seoMode,
    wordCount: analyseDocument(markdown).words,
    status: 'draft',
    sources: snapshot.sources as Source[],
  });
}
