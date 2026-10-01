import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { getPlatformSettings, updatePlatformSettings, type PlatformSettings } from '@/lib/platform/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return adminOnly(async () => NextResponse.json(await getPlatformSettings()));
}

export function PUT(request: Request) {
  return adminOnly(async () => {
    const patch = (await request.json().catch(() => ({}))) as Partial<PlatformSettings>;
    return NextResponse.json(await updatePlatformSettings(patch));
  });
}
