import { NextResponse } from 'next/server';
import { deleteSocialSet } from '@/lib/social/posts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteSocialSet(id);
  return NextResponse.json({ ok: true });
}
