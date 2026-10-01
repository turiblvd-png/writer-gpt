import { NextResponse } from 'next/server';
import { configuredProviders } from '@/lib/ai';
import { storageStatus } from '@/lib/db/store';
import { STEPS } from '@/lib/semantic/steps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    storage: storageStatus(),
    providers: configuredProviders(),
    tools: {
      'generate-content': 'ready',
      'semantic-writer': { status: 'ready', stages: STEPS.length },
      humanizer: 'ready',
      'rewrite-url': 'ready',
    },
  });
}
