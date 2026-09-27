import { NextResponse } from 'next/server';
import { listRewritten } from '@/lib/rewrite/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ articles: listRewritten() });
}
