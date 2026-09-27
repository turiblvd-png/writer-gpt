import { NextResponse } from 'next/server';
import { configuredProviders } from '@/lib/ai';
import { rewriteFromUrl, RewriteError } from '@/lib/rewrite/rewrite';
import { rewriteSchema } from '@/lib/rewrite/types';
import { UnsafeUrlError } from '@/lib/semantic/extract';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!configuredProviders().gemini) {
    return NextResponse.json(
      { error: 'No Gemini API key configured. Set GEMINI_API_KEY (see .env.example).' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = rewriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input.', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ article: await rewriteFromUrl(parsed.data) });
  } catch (err) {
    // A blocked URL is the caller's mistake, not a server fault.
    const status = err instanceof RewriteError || err instanceof UnsafeUrlError ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Rewrite failed.' },
      { status },
    );
  }
}
