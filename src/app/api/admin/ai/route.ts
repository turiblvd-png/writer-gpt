import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { aiAdminView } from '@/lib/ai/admin-view';
import { updateAiSettings, type AiSettingsPatch } from '@/lib/platform/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return adminOnly(async () => NextResponse.json(await aiAdminView()));
}

export function PUT(request: Request) {
  return adminOnly(async () => {
    const patch = (await request.json().catch(() => ({}))) as AiSettingsPatch;
    await updateAiSettings(patch);
    return NextResponse.json(await aiAdminView());
  });
}
