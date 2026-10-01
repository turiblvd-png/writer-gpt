import { NextResponse } from 'next/server';
import { aiReady, AI_NOT_READY } from '@/lib/ai';
import { suggestQueries } from '@/lib/visibility/check';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await aiReady())) {
    return NextResponse.json({ error: AI_NOT_READY }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { topic?: string; brand?: string };
  if (!body.topic?.trim()) return NextResponse.json({ error: 'Enter a topic first.' }, { status: 400 });
  try {
    return NextResponse.json({ queries: await suggestQueries(body.topic.trim(), body.brand?.trim() || '') });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not suggest queries.' }, { status: 500 });
  }
}
