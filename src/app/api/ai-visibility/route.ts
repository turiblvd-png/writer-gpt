import { NextResponse } from 'next/server';
import { z } from 'zod';
import { configuredProviders } from '@/lib/ai';
import { listChecks, runVisibilityCheck } from '@/lib/visibility/check';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const schema = z.object({
  domain: z.string().min(3).max(200),
  brand: z.string().max(120).optional(),
  queries: z.array(z.string().max(300)).min(1).max(20),
});

export async function GET() {
  return NextResponse.json({ checks: await safeRead(() => listChecks(), [], 'listChecks') });
}

export async function POST(request: Request) {
  if (!configuredProviders().gemini) {
    return NextResponse.json({ error: 'Set GEMINI_API_KEY in your hosting environment variables, then redeploy.' }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your site and at least one query.' }, { status: 400 });
  try {
    return NextResponse.json({ check: await runVisibilityCheck(parsed.data) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Check failed.' }, { status: 400 });
  }
}
