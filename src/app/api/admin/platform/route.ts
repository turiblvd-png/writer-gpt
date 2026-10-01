import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { getPlatformSettings, updatePlatformSettings, type PlatformSettings } from '@/lib/platform/settings';
import { logActivity } from '@/lib/activity/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return adminOnly(async () => NextResponse.json(await getPlatformSettings()));
}

export function PUT(request: Request) {
  return adminOnly(async () => {
    const patch = (await request.json().catch(() => ({}))) as Partial<PlatformSettings>;
    const saved = await updatePlatformSettings(patch);
    await logActivity({
      kind: 'admin', action: 'admin.platform', ok: true,
      detail: [patch.signupsOpen !== undefined ? `sign-ups ${patch.signupsOpen ? 'opened' : 'closed'}` : '', patch.nav ? `menu saved, ${saved.nav.hidden.length} tool(s) hidden` : ''].filter(Boolean).join('; '),
    });
    return NextResponse.json(saved);
  });
}
