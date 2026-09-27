import { NextResponse } from 'next/server';
import { listHumanized } from '@/lib/humanizer/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ articles: listHumanized() });
}
