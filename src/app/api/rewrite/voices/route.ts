import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createBrandVoice, listBrandVoices } from '@/lib/rewrite/store';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(10, 'Describe the voice in a sentence or two.').max(1500),
  avoidPhrases: z.array(z.string()).max(50).optional(),
});

export async function GET() {
  return NextResponse.json({ voices: await safeRead(() => listBrandVoices(), [], 'listBrandVoices') });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input.', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  return NextResponse.json({ voice: await createBrandVoice(parsed.data) }, { status: 201 });
}
