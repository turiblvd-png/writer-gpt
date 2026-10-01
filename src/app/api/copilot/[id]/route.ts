import { NextResponse } from 'next/server';
import { deleteConversation, getConversation } from '@/lib/copilot/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteConversation(id);
  return NextResponse.json({ ok: true });
}
