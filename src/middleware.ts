import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, isAdminPath, isAdminRole, isPublicPath, SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/** Passes the request on, tagged with its path so the activity log can name the tool. */
function pass(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set('x-wg-path', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!authEnabled() || isPublicPath(pathname)) return pass(request);

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
  return pass(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
