import { NextResponse } from 'next/server';
import { configuredProviders } from '@/lib/ai';
import { runNext } from '@/lib/autopilot/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Scheduled tick. Vercel Cron calls this with "Authorization: Bearer
 * <CRON_SECRET>" when CRON_SECRET is set, so without the secret nobody can
 * spend the owner's API quota by hitting the URL.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Set CRON_SECRET to enable scheduled Autopilot runs.' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!configuredProviders().gemini) return NextResponse.json({ error: 'GEMINI_API_KEY is not set.' }, { status: 503 });

  const tick = await runNext(request.signal);
  return NextResponse.json({ ran: tick.item?.keyword ?? null, status: tick.item?.status ?? 'idle', remaining: tick.remaining });
}
