import { NextResponse } from 'next/server';
import { configuredProviders } from '@/lib/ai';
import { SEMANTIC_WRITER_READY } from '@/lib/pipelines/semantic-writer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: configuredProviders(),
    tools: {
      'generate-content': 'ready',
      'semantic-writer': SEMANTIC_WRITER_READY ? 'ready' : 'awaiting-steps',
      humanizer: 'not-built',
      'rewrite-url': 'not-built',
    },
  });
}
