import { NextResponse } from 'next/server';
import { deleteHumanized, getHumanized } from '@/lib/humanizer/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getHumanized(id);
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ article });
}

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteHumanized(id);
  return NextResponse.json({ ok: true });
}
