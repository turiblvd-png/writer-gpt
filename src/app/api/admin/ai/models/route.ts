import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { listModels } from '@/lib/ai/catalog';
import { PROVIDERS } from '@/lib/platform/settings';
import type { ProviderId } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return adminOnly(async () => {
    const provider = new URL(request.url).searchParams.get('provider') as ProviderId;
    if (!PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 });
    return NextResponse.json(await listModels(provider));
  });
}
