import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { testProvider } from '@/lib/ai';
import { PROVIDERS } from '@/lib/platform/settings';
import type { ProviderId } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function POST(request: Request) {
  return adminOnly(async () => {
    const body = await request.json().catch(() => null);
    const provider = body?.provider as ProviderId;
    const model = typeof body?.model === 'string' ? body.model.trim() : '';
    if (!PROVIDERS.includes(provider) || !model) return NextResponse.json({ error: 'Pick a provider and model.' }, { status: 400 });
    return NextResponse.json(await testProvider({ provider, model }));
  });
}
