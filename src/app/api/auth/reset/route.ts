import { NextResponse } from 'next/server';
import { authEnabled } from '@/lib/auth/session';
import { AuthError, resetOwnerPassword } from '@/lib/auth/users';
import { withSession } from '@/lib/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Developer password recovery with the setup code; signs in on success. */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ error: 'Accounts are off.' }, { status: 503 });
  const body = await request.json().catch(() => null);
  try {
    // Slows guessing of the setup code.
    await new Promise((r) => setTimeout(r, 600));
    const user = await resetOwnerPassword(String(body?.email ?? ''), String(body?.setupCode ?? ''), String(body?.password ?? ''));
    return withSession(NextResponse.json({ ok: true }), user);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: `Reset failed on the server: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
