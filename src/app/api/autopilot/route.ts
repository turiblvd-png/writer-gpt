import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearFinished, enqueue, listQueue } from '@/lib/autopilot/queue';
import { SEO_MODES, type SeoMode } from '@/lib/content/types';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  keywords: z.array(z.string()).min(1).max(200),
  language: z.string().min(2).max(40).optional(),
  seoMode: z.enum(Object.keys(SEO_MODES) as [SeoMode, ...SeoMode[]]).optional(),
  targetWords: z.number().int().min(300).max(6000).optional(),
  includeFaq: z.boolean().optional(),
});

export async function GET() {
  return NextResponse.json({ queue: await safeRead(() => listQueue(), [], 'listQueue') });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Add at least one keyword.' }, { status: 400 });
  const { keywords, ...settings } = parsed.data;
  try {
    const added = await enqueue(keywords, settings);
    return NextResponse.json({ added, queue: await listQueue() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not queue keywords.' }, { status: 400 });
  }
}

/** Clears finished and failed items. */
export async function DELETE() {
  const removed = await clearFinished();
  return NextResponse.json({ removed, queue: await listQueue() });
}
