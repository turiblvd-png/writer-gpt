import { NextResponse } from 'next/server';
import { deleteRewritten } from '@/lib/rewrite/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteRewritten(id);
  return NextResponse.json({ ok: true });
}
