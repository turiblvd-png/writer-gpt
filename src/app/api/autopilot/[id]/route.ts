import { NextResponse } from 'next/server';
import { removeItem, retryItem } from '@/lib/autopilot/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Retry a failed item. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await retryItem(id);
  if (!item) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await removeItem(id);
  return NextResponse.json({ ok: true });
}
