import { NextResponse } from 'next/server';
import { z } from 'zod';
import { configuredProviders } from '@/lib/ai';
import { listConversations, sendMessage } from '@/lib/copilot/chat';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const schema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

export async function GET() {
  return NextResponse.json({ conversations: await safeRead(() => listConversations(), [], 'listConversations') });
}

export async function POST(request: Request) {
  if (!configuredProviders().gemini) {
    return NextResponse.json({ error: 'Set GEMINI_API_KEY in your hosting environment variables, then redeploy.' }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Type a question first.' }, { status: 400 });

  try {
    return NextResponse.json({ conversation: await sendMessage({ ...parsed.data, signal: request.signal }) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The copilot could not answer.' }, { status: 500 });
  }
}
