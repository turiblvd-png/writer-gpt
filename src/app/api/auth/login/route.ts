import { NextResponse } from 'next/server';
import { authEnabled } from '@/lib/auth/session';
import { AuthError, signIn } from '@/lib/auth/users';
import { withSession } from '@/lib/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email.trim() || !password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  try {
    const user = await signIn(email, password);
    return withSession(NextResponse.json({ ok: true, user }), user);
  } catch (err) {
    if (err instanceof AuthError) {
      // Slows guessing without needing shared rate-limit state.
      if (err.status === 401) await new Promise((r) => setTimeout(r, 600));
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[auth] sign-in failed', err);
    return NextResponse.json(
      { error: `Sign-in failed on the server: ${err instanceof Error ? err.message : String(err)}. Check that the database is connected (Vercel → Storage).` },
      { status: 500 },
    );
  }
}
