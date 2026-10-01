import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, isAdminPath, isAdminRole, isPublicPath, SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!authEnabled() || isPublicPath(pathname)) return NextResponse.next();

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith('/api/');

  if (!session) {
    if (isApi) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }

  // The developer dashboard. Server code checks the role again from the database.
  if (isAdminPath(pathname) && !isAdminRole(session.role)) {
    if (isApi) return NextResponse.json({ error: 'Developer access only.' }, { status: 403 });
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
