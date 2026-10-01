'use client';

import { readJson } from '@/lib/http/read-json';
import { useMemo, useState } from 'react';
import type { SubscriberRow } from '@/lib/admin/subscribers';
import { Notice, StatTile } from '@/components/semantic-ui';
import { IconTrash } from '@/components/icons';

const PLANS = ['free', 'pro', 'business'] as const;

function ago(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function SubscribersWorkspace({
  initialRows, initialSignupsOpen, viewerIsOwner, viewerId,
}: { initialRows: SubscriberRow[]; initialSignupsOpen: boolean; viewerIsOwner: boolean; viewerId: string | null }) {
  const [rows, setRows] = useState(initialRows);
  const [signupsOpen, setSignupsOpen] = useState(initialSignupsOpen);
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | (typeof PLANS)[number]>('all');
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => rows.filter((r) =>
    (planFilter === 'all' || r.plan === planFilter) &&
    (!query || `${r.name} ${r.email}`.toLowerCase().includes(query.toLowerCase()))), [rows, query, planFilter]);

  const totals = {
    users: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    paying: rows.filter((r) => r.plan !== 'free' && r.role !== 'owner').length,
    cost: rows.reduce((s, r) => s + r.usage.costUsd, 0),
  };

  async function patch(id: string, body: Record<string, string | number | null>) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await readJson(res);
    if (!res.ok) return setError(data.error ?? 'Could not update.');
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...data.user } : r)));
  }

  async function remove(row: SubscriberRow) {
    if (!window.confirm(`Delete ${row.email}? Their account is removed; their saved articles stay in the database.`)) return;
    const res = await fetch(`/api/admin/users/${row.id}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok) return setError(data.error ?? 'Could not delete.');
    setRows((list) => list.filter((r) => r.id !== row.id));
  }

  async function resetPassword(row: SubscriberRow) {
    if (!window.confirm(`Set a new temporary password for ${row.email}?`)) return;
    const res = await fetch(`/api/admin/users/${row.id}/password`, { method: 'POST' });
    const data = await readJson(res);
    if (!res.ok) return setError(data.error ?? 'Could not reset.');
    window.prompt(`Temporary password for ${row.email}. Copy it and send it to them; they can change it under Account.`, data.password);
  }

  async function toggleSignups(open: boolean) {
    setSignupsOpen(open);
    await fetch('/api/admin/platform', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signupsOpen: open }) });
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Accounts" value={totals.users} />
        <StatTile label="Active" value={totals.active} tone="ok" />
        <StatTile label="On a paid plan" value={totals.paying} />
        <StatTile label="AI cost this month" value={`$${totals.cost.toFixed(2)}`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="field max-w-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" aria-label="Search subscribers" />
        <select className="field w-auto" value={planFilter} onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)} aria-label="Filter by plan">
          <option value="all">All plans</option>
          {PLANS.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
        </select>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={signupsOpen} onChange={(e) => void toggleSignups(e.target.checked)} />
          New sign-ups open
        </label>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="p-3">Person</th><th className="p-3">Plan</th><th className="p-3">Role</th><th className="p-3">Status</th>
              <th className="p-3">Joined</th><th className="p-3">Last active</th><th className="p-3 text-right">Articles</th>
              <th className="p-3 text-right">AI requests</th><th className="p-3">Monthly limit</th><th className="p-3 text-right">Est. cost</th><th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => {
              const isOwner = r.role === 'owner';
              const self = r.id === viewerId;
              return (
                <tr key={r.id} className={r.status === 'suspended' ? 'opacity-60' : ''}>
                  <td className="p-3">
                    <div className="font-medium">{r.name}{self && <span className="ml-1 text-xs text-ink-3">(you)</span>}</div>
                    <div className="text-xs text-ink-3">{r.email}</div>
                  </td>
                  <td className="p-3">
                    <select className="field w-32 py-1 capitalize" value={r.plan} onChange={(e) => void patch(r.id, { plan: e.target.value })} aria-label={`Plan for ${r.email}`}>
                      {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    {isOwner ? <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">Developer</span>
                      : viewerIsOwner ? (
                        <select className="field w-32 py-1" value={r.role} onChange={(e) => void patch(r.id, { role: e.target.value })} aria-label={`Role for ${r.email}`}>
                          <option value="subscriber">Subscriber</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : <span className="capitalize">{r.role}</span>}
                  </td>
                  <td className="p-3">
                    {isOwner ? <span className="text-ok">Active</span> : (
                      <button className={`rounded-md px-2 py-1 text-xs font-bold ${r.status === 'active' ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}`}
                              onClick={() => void patch(r.id, { status: r.status === 'active' ? 'suspended' : 'active' })}
                              title={r.status === 'active' ? 'Click to suspend' : 'Click to reactivate'}>
                        {r.status === 'active' ? 'Active' : 'Suspended'}
                      </button>
                    )}
                  </td>
                  <td className="p-3 text-xs text-ink-3">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="p-3 text-xs text-ink-3">{ago(r.lastSeenAt)}</td>
                  <td className="p-3 text-right font-mono">{r.articles}</td>
                  <td className="p-3 text-right font-mono">
                    <span className={r.limit !== null && r.usage.requests >= r.limit ? 'text-bad' : ''}>{r.usage.requests}</span>
                  </td>
                  <td className="p-3">
                    {r.limitSource === 'unlimited' ? <span className="text-xs text-ink-3">Unlimited</span> : (
                      <LimitInput
                        value={r.limitSource === 'custom' ? r.limit : null}
                        planLimit={r.limitSource === 'plan' ? r.limit : null}
                        onSave={(v) => void patch(r.id, { requestLimit: v })}
                      />
                    )}
                  </td>
                  <td className="p-3 text-right font-mono">${r.usage.costUsd.toFixed(3)}</td>
                  <td className="p-3 text-right">
                    {!isOwner && !self && (
                      <span className="inline-flex items-center gap-1">
                        <button className="rounded-lg px-2 py-1 text-xs text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => void resetPassword(r)}>
                          Reset password
                        </button>
                        <button className="rounded-lg p-1.5 text-ink-3 hover:text-bad" onClick={() => void remove(r)} aria-label={`Delete ${r.email}`}>
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={11} className="p-6 text-center text-ink-3">No accounts match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Plans are labels for now. Card payments (Stripe) and plan limits are the next step; until then, set a subscriber&apos;s plan here by hand.
      </p>
    </>
  );
}

/** Blank means "use the plan's allowance"; a number gives this person their own. */
function LimitInput({ value, planLimit, onSave }: { value: number | null; planLimit: number | null; onSave: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const commit = () => {
    const next = text.trim() === '' ? null : Math.max(0, Math.floor(Number(text)) || 0);
    if (next !== value) onSave(next);
  };
  return (
    <input
      className="field w-28 py-1 text-xs" inputMode="numeric" value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder={planLimit === null ? 'Plan: unlimited' : `Plan: ${planLimit}`}
      title="Leave empty to use the plan's allowance" aria-label="Monthly AI request limit"
    />
  );
}
