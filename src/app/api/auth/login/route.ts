import { NextResponse } from 'next/server';
import { safeEqual, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.json({ ok: true });

  const body = await request.json().catch(() => null);
  const attempt = typeof body?.password === 'string' ? body.password : '';
  if (!safeEqual(attempt, password)) {
    // Slows guessing without needing shared rate-limit state.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
