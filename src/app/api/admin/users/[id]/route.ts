import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { deleteUser, updateUser, type Plan, type UserStatus } from '@/lib/auth/users';
import { currentActor } from '@/lib/auth/actor';
import type { Role } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return adminOnly(async () => {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { status?: UserStatus; plan?: Plan; role?: Role; requestLimit?: number | null };
    // Only the developer can hand out admin rights.
    if (body.role && (await currentActor())?.role !== 'owner') {
      return NextResponse.json({ error: 'Only the developer can change roles.' }, { status: 403 });
    }
    const user = await updateUser(id, body);
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    await logActivity({ kind: 'admin', action: 'admin.user_update', ok: true, detail: `${user.email}: ${JSON.stringify(body)}` });
    return NextResponse.json({ user });
  });
}

export function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return adminOnly(async () => {
    const { id } = await params;
    await deleteUser(id);
    await logActivity({ kind: 'admin', action: 'admin.user_delete', ok: true, detail: id });
    return NextResponse.json({ ok: true });
  });
}
