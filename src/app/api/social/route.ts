import { NextResponse } from 'next/server';
import { z } from 'zod';
import { configuredProviders } from '@/lib/ai';
import { generateSocialPosts, listSocialSets, PLATFORMS, type Platform } from '@/lib/social/posts';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const schema = z.object({
  articleId: z.string().optional(),
  title: z.string().max(300).optional(),
  text: z.string().max(60_000).optional(),
  url: z.string().max(500).optional(),
  tone: z.string().max(80).optional(),
  platforms: z.array(z.enum(Object.keys(PLATFORMS) as [Platform, ...Platform[]])).min(1),
});

export async function GET() {
  return NextResponse.json({ sets: await safeRead(() => listSocialSets(), [], 'listSocialSets') });
}

export async function POST(request: Request) {
  if (!configuredProviders().gemini) {
    return NextResponse.json({ error: 'Set GEMINI_API_KEY in your hosting environment variables, then redeploy.' }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pick an article and at least one platform.' }, { status: 400 });
  try {
    return NextResponse.json({ set: await generateSocialPosts(parsed.data) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not write posts.' }, { status: 500 });
  }
}
