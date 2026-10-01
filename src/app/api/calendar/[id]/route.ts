import { NextResponse } from 'next/server';
import { removeEntry, updateEntry } from '@/lib/calendar/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.date !== 'string' || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'A date and a title are required.' }, { status: 400 });
  }
  try {
    const entry = await updateEntry(id, body);
    if (!entry) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save.' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await removeEntry(id);
  return NextResponse.json({ ok: true });
}
