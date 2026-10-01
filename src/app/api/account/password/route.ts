import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/auth/actor';
import { AuthError, changePassword } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    await changePassword(actor.id, String(body?.current ?? ''), String(body?.next ?? ''));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
