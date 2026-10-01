import { NextResponse } from 'next/server';
import { listHumanized } from '@/lib/humanizer/store';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ articles: await safeRead(() => listHumanized(), [], 'listHumanized') });
}
