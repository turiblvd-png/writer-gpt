import { NextResponse } from 'next/server';
import { addEntry, listEntries } from '@/lib/calendar/store';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  return NextResponse.json({ entries: await safeRead(() => listEntries(from, to), [], 'listEntries') });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.date !== 'string' || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'A date and a title are required.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ entry: await addEntry(body) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save.' }, { status: 400 });
  }
}
