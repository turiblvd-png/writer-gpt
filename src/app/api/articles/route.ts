import { NextResponse } from 'next/server';
import { listArticles } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ articles: listArticles() });
}
