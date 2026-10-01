import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { aiAdminView } from '@/lib/ai/admin-view';
import { updateAiSettings, type AiSettingsPatch } from '@/lib/platform/settings';
import { logActivity } from '@/lib/activity/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return adminOnly(async () => NextResponse.json(await aiAdminView()));
}

export function PUT(request: Request) {
  return adminOnly(async () => {
    const patch = (await request.json().catch(() => ({}))) as AiSettingsPatch;
    await updateAiSettings(patch);
    // Describe the change without ever logging a key.
    const parts = [
      ...Object.entries(patch.keys ?? {}).map(([p, v]) => `${p} key ${v ? 'saved' : 'removed'}`),
      ...Object.entries(patch.roles ?? {}).map(([r, c]) => `${r} -> ${c ? `${c.provider}:${c.model}` : 'default'}`),
      ...(patch.fallbackOrder ? [`fallback order ${patch.fallbackOrder.join(' > ')}`] : []),
      ...(patch.strictSearch !== undefined ? [`search steps ${patch.strictSearch ? 'stop when Gemini fails' : 'fall back without search'}`] : []),
    ];
    await logActivity({ kind: 'admin', action: 'admin.ai_settings', ok: true, detail: parts.join('; ') });
    return NextResponse.json(await aiAdminView());
  });
}
