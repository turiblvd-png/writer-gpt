import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from './session';
import type { PublicUser } from './users';

/** Signs the user in by setting the session cookie on a response. */
export async function withSession(res: NextResponse, user: PublicUser): Promise<NextResponse> {
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
