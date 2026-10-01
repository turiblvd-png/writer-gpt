import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { listActivity, type ActivityKind } from '@/lib/activity/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return adminOnly(async () => {
    const q = new URL(request.url).searchParams;
    const ok = q.get('ok');
    return NextResponse.json({
      events: await listActivity({
        kind: (q.get('kind') as ActivityKind) || undefined,
        userId: q.get('userId') || undefined,
        tool: q.get('tool') || undefined,
        ok: ok === 'true' ? true : ok === 'false' ? false : undefined,
        before: Number(q.get('before')) || undefined,
        limit: Number(q.get('limit')) || 200,
      }),
    });
  });
}
