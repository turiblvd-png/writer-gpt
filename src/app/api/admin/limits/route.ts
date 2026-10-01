import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/auth/admin-route';
import { getLimits, monthSpendUsd, updateLimits, type Limits } from '@/lib/usage/limits';
import { logActivity } from '@/lib/activity/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return adminOnly(async () => NextResponse.json({ limits: await getLimits(), spendUsd: await monthSpendUsd() }));
}

export function PUT(request: Request) {
  return adminOnly(async () => {
    const patch = (await request.json().catch(() => ({}))) as Partial<Limits>;
    const limits = await updateLimits(patch);
    const show = (v: number | null) => (v === null ? 'unlimited' : String(v));
    await logActivity({
      kind: 'admin', action: 'admin.limits', ok: true,
      detail: `free ${show(limits.plans.free)}, pro ${show(limits.plans.pro)}, business ${show(limits.plans.business)}, budget ${limits.budgetUsd === null ? 'none' : `$${limits.budgetUsd}`}`,
    });
    return NextResponse.json({ limits, spendUsd: await monthSpendUsd() });
  });
}
