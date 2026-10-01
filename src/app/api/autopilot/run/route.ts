import { NextResponse } from 'next/server';
import { aiReady, AI_NOT_READY } from '@/lib/ai';
import { runNext } from '@/lib/autopilot/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One full article per tick.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!(await aiReady())) {
    return NextResponse.json({ error: AI_NOT_READY }, { status: 503 });
  }
  try {
    return NextResponse.json(await runNext(request.signal));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Autopilot tick failed.' }, { status: 500 });
  }
}
