import { NextResponse } from 'next/server';
import { deleteArticle, getArticle } from '@/lib/db/store';
import { safeRead } from '@/lib/db/safe';
import { analyseSeo } from '@/lib/seo/analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await safeRead(() => getArticle(id), null, 'getArticle');
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const report = analyseSeo({
    markdown: article.markdown,
    title: article.title,
    metaDescription: article.metaDescription,
    focusKeyword: article.focusKeyword,
    slug: article.slug,
  });

  return NextResponse.json({ article, report });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteArticle(id);
  return NextResponse.json({ ok: true });
}
