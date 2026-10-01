'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActivityEvent } from '@/lib/activity/log';
import { Spinner, StatTile } from '@/components/semantic-ui';

const ACTIONS: Record<string, string> = {
  'ai.request': 'AI request',
  'ai.blocked': 'Blocked by limit',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.signup': 'Signed up',
  'auth.logout': 'Signed out',
  'auth.password_reset': 'Password reset',
  'admin.ai_settings': 'AI settings changed',
  'admin.ai_test': 'Key test',
  'admin.limits': 'Limits changed',
  'admin.platform': 'Site settings changed',
  'admin.user_update': 'Subscriber updated',
  'admin.user_delete': 'Subscriber deleted',
  'admin.user_password_reset': 'Subscriber password reset',
};

function when(ts: number): string {
  const d = new Date(ts);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString() : d.toLocaleString();
}

export function ActivityWorkspace({ initial, users }: { initial: ActivityEvent[]; users: { id: string; email: string }[] }) {
  const [events, setEvents] = useState(initial);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(initial.length >= 200);
  const [open, setOpen] = useState<string | null>(null);

  const query = useCallback((before?: number) => {
    const q = new URLSearchParams({ limit: '200' });
    if (kind) q.set('kind', kind);
    if (status) q.set('ok', status);
    if (userId) q.set('userId', userId);
    if (before) q.set('before', String(before));
    return fetch(`/api/admin/activity?${q}`).then((r) => r.json()).then((d) => (d.events ?? []) as ActivityEvent[]);
  }, [kind, status, userId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await query().catch(() => null);
    if (next) {
      setEvents(next);
      setMore(next.length >= 200);
    }
    setLoading(false);
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [live, refresh]);

  async function loadMore() {
    const last = events.at(-1);
    if (!last) return;
    const older = await query(last.at).catch(() => []);
    setEvents((e) => [...e, ...older]);
    setMore(older.length >= 200);
  }

  const totals = useMemo(() => {
    const ai = events.filter((e) => e.kind === 'ai');
    return {
      requests: ai.filter((e) => e.action === 'ai.request').length,
      failed: events.filter((e) => !e.ok).length,
      tokens: ai.reduce((s, e) => s + (e.input ?? 0) + (e.output ?? 0), 0),
      cost: ai.reduce((s, e) => s + (e.costUsd ?? 0), 0),
    };
  }, [events]);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="AI requests shown" value={totals.requests} />
        <StatTile label="Failures shown" value={totals.failed} tone={totals.failed ? 'bad' : undefined} />
        <StatTile label="Tokens" value={totals.tokens.toLocaleString()} />
        <StatTile label="Est. cost" value={`$${totals.cost.toFixed(3)}`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="field w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="">Everything</option>
          <option value="ai">AI requests</option>
          <option value="auth">Sign-ins</option>
          <option value="admin">Dashboard changes</option>
        </select>
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Result">
          <option value="">Any result</option>
          <option value="true">Succeeded</option>
          <option value="false">Failed</option>
        </select>
        <select className="field w-auto max-w-[240px]" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Person">
          <option value="">Everyone</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
        </select>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live (every 10 s)
        </label>
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => void refresh()} disabled={loading}>{loading ? <Spinner /> : 'Refresh'}</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="p-3">Time</th><th className="p-3">Who</th><th className="p-3">What</th><th className="p-3">Model</th>
              <th className="p-3 text-right">Tokens in / out</th><th className="p-3 text-right">Cost</th><th className="p-3 text-right">Time taken</th><th className="p-3">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {events.map((e) => (
              <tr key={e.id} className="cursor-pointer align-top hover:bg-surface-2" onClick={() => setOpen(open === e.id ? null : e.id)}>
                <td className="whitespace-nowrap p-3 text-xs text-ink-3">{when(e.at)}</td>
                <td className="p-3 text-xs">{e.email ?? (e.userId ? e.userId.slice(0, 8) : <span className="text-ink-3">system</span>)}</td>
                <td className="p-3">
                  <div className="font-medium">{ACTIONS[e.action] ?? e.action}</div>
                  <div className="text-xs text-ink-3">{[e.tool, e.role].filter(Boolean).join(' · ')}</div>
                  {open === e.id && e.detail && <div className="mt-1 text-xs text-ink-2">{e.detail}</div>}
                </td>
                <td className="p-3 font-mono text-xs">
                  {e.provider ? `${e.provider}:${e.model}` : ''}
                  {e.fallbackFrom && <div className="text-[10px] text-warn">instead of {e.fallbackFrom}</div>}
                </td>
                <td className="p-3 text-right font-mono text-xs">{e.input !== undefined ? `${e.input.toLocaleString()} / ${(e.output ?? 0).toLocaleString()}` : ''}</td>
                <td className="p-3 text-right font-mono text-xs">{e.costUsd !== undefined ? `$${e.costUsd.toFixed(4)}` : ''}</td>
                <td className="p-3 text-right font-mono text-xs">{e.ms !== undefined ? `${(e.ms / 1000).toFixed(1)}s` : ''}</td>
                <td className="p-3">
                  {e.ok ? <span className="text-xs font-bold text-ok">OK</span> : (
                    <span className="block max-w-[260px] text-xs text-bad" title={e.error}>{open === e.id ? e.error : (e.error ?? 'Failed').slice(0, 80)}</span>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-ink-3">No activity yet for these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {more && <button className="btn-ghost mt-3" onClick={() => void loadMore()}>Load older</button>}
      <p className="mt-3 text-xs text-ink-3">Click a row for full details. API key values are never logged.</p>
    </>
  );
}
