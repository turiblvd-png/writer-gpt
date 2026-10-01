import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { resetPasswordByAdmin } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sets a temporary password for a subscriber and returns it once. */
export function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return adminOnly(async () => {
    const { id } = await params;
    return NextResponse.json({ password: await resetPasswordByAdmin(id) });
  });
}
