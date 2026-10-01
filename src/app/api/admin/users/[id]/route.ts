import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { deleteUser, updateUser, type Plan, type UserStatus } from '@/lib/auth/users';
import { currentActor } from '@/lib/auth/actor';
import type { Role } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return adminOnly(async () => {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { status?: UserStatus; plan?: Plan; role?: Role };
    // Only the developer can hand out admin rights.
    if (body.role && (await currentActor())?.role !== 'owner') {
      return NextResponse.json({ error: 'Only the developer can change roles.' }, { status: 403 });
    }
    const user = await updateUser(id, body);
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    return NextResponse.json({ user });
  });
}

export function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return adminOnly(async () => {
    const { id } = await params;
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  });
}
