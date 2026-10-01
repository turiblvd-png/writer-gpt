import { NextResponse } from 'next/server';
import { requireAdmin } from './viewer';

/** Runs an admin API handler, answering 403 for anyone but the developer and admins. */
export async function adminOnly(handler: () => Promise<Response>): Promise<Response> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Developer access only.' }, { status: 403 });
  }
  try {
    return await handler();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Request failed.' }, { status: 400 });
  }
}
