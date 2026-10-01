import { NextResponse } from 'next/server';
import { aiReady, AI_NOT_READY } from '@/lib/ai';
import { humanize, HumanizeError } from '@/lib/humanizer/humanize';
import { humanizeSchema } from '@/lib/humanizer/types';
import { getArticle } from '@/lib/db/store';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!(await aiReady())) {
    return NextResponse.json(
      { error: AI_NOT_READY },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = humanizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input.', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const input = { ...parsed.data };

  // "My article" mode passes an id; resolve it server-side so the client never
  // has to ship the whole article body back up.
  if (input.sourceArticleId) {
    const article = await getArticle(input.sourceArticleId);
    if (!article) return NextResponse.json({ error: 'That article no longer exists.' }, { status: 404 });
    input.text = article.markdown;
    input.title = input.title || article.title;
    if (input.language === 'auto') input.language = article.language;
  }

  try {
    return NextResponse.json({ article: await humanize(input) });
  } catch (err) {
    const status = err instanceof HumanizeError ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Humanization failed.' },
      { status },
    );
  }
}
