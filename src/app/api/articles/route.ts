import { NextResponse } from 'next/server';
import { listArticles } from '@/lib/db/store';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ articles: await safeRead(() => listArticles(), [], 'listArticles') });
}
