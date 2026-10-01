import { NextResponse } from 'next/server';
import { z } from 'zod';
import { configuredProviders } from '@/lib/ai';
import { listResearch, researchKeywords } from '@/lib/keywords/research';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const schema = z.object({
  seed: z.string().min(2).max(200),
  language: z.string().max(40).optional(),
  location: z.string().max(80).optional(),
});

export async function GET() {
  return NextResponse.json({ research: await safeRead(() => listResearch(), [], 'listResearch') });
}

export async function POST(request: Request) {
  if (!configuredProviders().gemini) {
    return NextResponse.json({ error: 'Set GEMINI_API_KEY in your hosting environment variables, then redeploy.' }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a seed keyword.' }, { status: 400 });

  try {
    return NextResponse.json({ research: await researchKeywords(parsed.data) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Research failed.' }, { status: 500 });
  }
}
