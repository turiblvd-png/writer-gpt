import { NextResponse } from 'next/server';
import { generateInputSchema } from '@/lib/content/types';
import { generateContentPipeline, initialGenerateState } from '@/lib/pipelines/generate-content';
import { startRun } from '@/lib/runs/manager';
import { configuredProviders } from '@/lib/ai';

export const runtime = 'nodejs';

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

  const parsed = generateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input.', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const runId = startRun(generateContentPipeline, initialGenerateState(parsed.data));
    return NextResponse.json({ runId }, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start run.' },
      { status: 500 },
    );
  }
}
