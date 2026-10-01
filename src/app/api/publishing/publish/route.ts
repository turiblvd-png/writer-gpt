import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publishArticle, WordPressError } from '@/lib/publishing/wordpress';
import { UnsafeUrlError } from '@/lib/semantic/extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  articleId: z.string().min(1),
  status: z.enum(['draft', 'publish', 'future']),
  date: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pick an article and a status.' }, { status: 400 });
  try {
    return NextResponse.json(await publishArticle(parsed.data.articleId, parsed.data));
  } catch (err) {
    const status = err instanceof WordPressError ? err.status : err instanceof UnsafeUrlError ? 400 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Publishing failed.' }, { status });
  }
}
