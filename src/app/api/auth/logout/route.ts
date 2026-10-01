import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity/log';

export const runtime = 'nodejs';

export async function POST() {
  await logActivity({ kind: 'auth', action: 'auth.logout', ok: true });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
