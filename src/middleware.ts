import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, isPublicPath, isValidSession, SESSION_COOKIE } from '@/lib/auth/session';

export async function middleware(request: NextRequest) {
  if (!authEnabled() || isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== '/') login.searchParams.set('next', next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
