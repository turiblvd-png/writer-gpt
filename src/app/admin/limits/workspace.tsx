'use client';

import { useState } from 'react';
import type { Limits } from '@/lib/usage/limits';
import { Notice, Panel, Spinner } from '@/components/semantic-ui';
import { IconKey } from '@/components/icons';

const PLANS = [
  { id: 'free', label: 'Free' },
  { id: 'pro', label: 'Pro' },
  { id: 'business', label: 'Business' },
] as const;

const toField = (v: number | null) => (v === null ? '' : String(v));
const fromField = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v)) || 0));

export function LimitsWorkspace({ initial, spendUsd }: { initial: Limits; spendUsd: number }) {
  const [plans, setPlans] = useState(() => Object.fromEntries(PLANS.map((p) => [p.id, toField(initial.plans[p.id])])) as Record<(typeof PLANS)[number]['id'], string>);
  const [budget, setBudget] = useState(toField(initial.budgetUsd));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const budgetNum = fromField(budget);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch('/api/admin/limits', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plans: { free: fromField(plans.free), pro: fromField(plans.pro), business: fromField(plans.business) },
        budgetUsd: budget.trim() === '' ? null : Number(budget),
      }),
    });
    setSaving(false);
    setMsg(res.ok ? { tone: 'ok', text: 'Limits saved. They apply to the next request.' } : { tone: 'bad', text: (await res.json().catch(() => ({}))).error ?? 'Could not save.' });
  }

  return (
    <>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Panel icon={<IconKey />} title="Monthly AI requests per plan" subtitle="Leave a box empty for unlimited. A full article uses about 6 to 10 requests; a Copilot answer or audit uses 1. Allowances reset on the 1st of each month.">
        <div className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <label key={p.id} className="block">
              <span className="mb-1 block text-sm font-semibold">{p.label}</span>
              <input className="field" inputMode="numeric" value={plans[p.id]} onChange={(e) => setPlans((s) => ({ ...s, [p.id]: e.target.value.replace(/[^\d]/g, '') }))}
                     placeholder="Unlimited" aria-label={`${p.label} monthly requests`} />
              <span className="mt-1 block text-xs text-ink-3">
                {plans[p.id] ? `About ${Math.max(1, Math.floor(Number(plans[p.id]) / 8))} articles a month` : 'No limit'}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-3">To give one person a different allowance, set it in their row on the Subscribers page.</p>
      </Panel>

      <Panel title="Monthly AI budget" subtitle="When estimated AI spend this month reaches this amount, subscribers are paused until the 1st. You keep full access. Leave empty for no cap.">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-lg font-bold">$</span>
          <input className="field w-40" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="No cap" aria-label="Monthly budget in dollars" />
          <span className="text-sm text-ink-3">
            Spent so far this month: <strong className="text-ink">${spendUsd.toFixed(2)}</strong>
            {budgetNum !== null && budgetNum > 0 && <> ({Math.min(100, Math.round((spendUsd / budgetNum) * 100))}% of the cap)</>}
          </span>
        </div>
        {budgetNum !== null && budgetNum > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
            <div className={`h-full ${spendUsd >= budgetNum ? 'bg-bad' : spendUsd >= budgetNum * 0.8 ? 'bg-warn' : 'bg-ok'}`} style={{ width: `${Math.min(100, (spendUsd / budgetNum) * 100)}%` }} />
          </div>
        )}
        <p className="mt-3 text-xs text-ink-3">Estimates use list prices and token counts reported by each provider. Check the provider&apos;s billing page for the exact charge.</p>
      </Panel>

      <button className="btn-primary" disabled={saving} onClick={() => void save()}>{saving ? <><Spinner /> Saving…</> : 'Save limits'}</button>
    </>
  );
}
