import { NextResponse } from 'next/server';
import { authEnabled } from '@/lib/auth/session';
import { AuthError, signUp } from '@/lib/auth/users';
import { withSession } from '@/lib/auth/http';
import { getPlatformSettings } from '@/lib/platform/settings';
import { ownerEmail } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!authEnabled()) {
    return NextResponse.json({ error: 'Accounts are off. Set APP_PASSWORD in your hosting environment variables.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : '';
  const settings = await getPlatformSettings();
  if (!settings.signupsOpen && email.trim().toLowerCase() !== ownerEmail()) {
    return NextResponse.json({ error: 'Sign-ups are closed right now.' }, { status: 403 });
  }
  try {
    const user = await signUp({
      email,
      password: typeof body?.password === 'string' ? body.password : '',
      name: typeof body?.name === 'string' ? body.name : '',
      setupCode: typeof body?.setupCode === 'string' ? body.setupCode : '',
    });
    return withSession(NextResponse.json({ ok: true, user }), user);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
