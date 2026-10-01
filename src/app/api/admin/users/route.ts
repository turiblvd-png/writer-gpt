import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { subscriberRows } from '@/lib/admin/subscribers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return adminOnly(async () => NextResponse.json({ users: await subscriberRows() }));
}
