'use client';

import { readJson } from '@/lib/http/read-json';
import { useEffect, useState } from 'react';
import type { AiAdminView } from '@/lib/ai/admin-view';
import type { ProviderId } from '@/lib/ai/types';
import type { ModelRole } from '@/lib/platform/settings';
import { Notice, Panel, Spinner } from '@/components/semantic-ui';
import { SortableList } from '@/components/sortable';
import { IconKey, IconRobot, IconRefresh } from '@/components/icons';

const PROVIDERS: ProviderId[] = ['gemini', 'deepseek', 'grok'];
const NAMES: Record<ProviderId, string> = { gemini: 'Google Gemini', deepseek: 'DeepSeek', grok: 'xAI Grok' };
const KEY_HELP: Record<ProviderId, { url: string; label: string }> = {
  gemini: { url: 'https://aistudio.google.com/apikey', label: 'aistudio.google.com/apikey' },
  deepseek: { url: 'https://platform.deepseek.com/api_keys', label: 'platform.deepseek.com' },
  grok: { url: 'https://console.x.ai', label: 'console.x.ai' },
};

const ROLES: { id: ModelRole; label: string; help: string; search?: boolean }[] = [
  { id: 'research', label: 'Research', help: 'Reads live Google results before writing.', search: true },
  { id: 'reason', label: 'Planning', help: 'Search intent, outlines, voice analysis.' },
  { id: 'draft', label: 'Writing', help: 'Articles, rewrites, humanizing, social posts. Uses the most tokens.' },
  { id: 'structure', label: 'Data', help: 'Titles, meta descriptions, keyword lists (JSON).' },
  { id: 'verify', label: 'Fact check', help: 'Checks claims against live search.', search: true },
];

interface TestResult {
  ok: boolean;
  ms: number;
  reply?: string;
  model?: string;
  error?: string;
  raw?: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error ?? `Request failed (HTTP ${res.status}).`);
  return data as T;
}

export function AiModelsWorkspace({ initial }: { initial: AiAdminView }) {
  const [view, setView] = useState(initial);
  const [models, setModels] = useState<Partial<Record<ProviderId, { models: string[]; live: boolean; error?: string }>>>({});
  const [keyDrafts, setKeyDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [roles, setRoles] = useState(() => Object.fromEntries(ROLES.map((r) => [r.id, { provider: initial.roles[r.id].provider, model: initial.roles[r.id].model }])) as Record<ModelRole, { provider: ProviderId; model: string }>);
  const [order, setOrder] = useState<ProviderId[]>(initial.fallbackOrder);
  const [strictSearch, setStrictSearch] = useState(initial.strictSearch);
  const [tests, setTests] = useState<Record<string, TestResult | 'running'>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  async function loadModels(p: ProviderId, force = false) {
    if (models[p] && !force) return;
    try {
      const list = await api<{ models: string[]; live: boolean; error?: string }>(`/api/admin/ai/models?provider=${p}`);
      setModels((m) => ({ ...m, [p]: list }));
    } catch (err) {
      setModels((m) => ({ ...m, [p]: { models: [], live: false, error: err instanceof Error ? err.message : 'Could not load models.' } }));
    }
  }

  useEffect(() => {
    for (const p of PROVIDERS) void loadModels(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(label: string, patch: Record<string, unknown>) {
    setSaving(label);
    setNotice(null);
    try {
      const next = await api<AiAdminView>('/api/admin/ai', { method: 'PUT', body: JSON.stringify(patch) });
      setView(next);
      setNotice({ tone: 'ok', text: `${label} saved. It applies to the next request.` });
      return next;
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not save.' });
      return null;
    } finally {
      setSaving(null);
    }
  }

  async function saveKey(p: ProviderId, value: string) {
    const next = await save(`${NAMES[p]} key`, { keys: { [p]: value } });
    if (next) {
      setKeyDrafts((d) => ({ ...d, [p]: '' }));
      void loadModels(p, true);
      if (value) void runTest(`key-${p}`, p, roles.draft.provider === p ? roles.draft.model : next.defaults[p].draft);
    }
  }

  async function runTest(id: string, provider: ProviderId, model: string) {
    setTests((t) => ({ ...t, [id]: 'running' }));
    try {
      const result = await api<TestResult>('/api/admin/ai/test', { method: 'POST', body: JSON.stringify({ provider, model }) });
      setTests((t) => ({ ...t, [id]: result }));
    } catch (err) {
      setTests((t) => ({ ...t, [id]: { ok: false, ms: 0, error: err instanceof Error ? err.message : 'Test failed.' } }));
    }
  }

  function setRole(role: ModelRole, provider: ProviderId, model?: string) {
    setRoles((r) => ({ ...r, [role]: { provider, model: model ?? view.defaults[provider][role] } }));
  }

  const rolesChanged = ROLES.some((r) => roles[r.id].provider !== view.roles[r.id].provider || roles[r.id].model !== view.roles[r.id].model);

  return (
    <>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <Panel icon={<IconKey />} title="1. API keys" subtitle="Paste a key and press Save. It is encrypted before it is stored and never shown again. A test runs straight after saving.">
        <div className="space-y-4">
          {PROVIDERS.map((p) => {
            const k = view.keys[p];
            const test = tests[`key-${p}`];
            return (
              <div key={p} className="rounded-xl border border-line p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h4 className="font-bold">{NAMES[p]}</h4>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${k.present ? 'bg-ok/15 text-ok' : 'bg-surface-3 text-ink-3'}`}>
                    {k.present ? `Connected ${k.hint}` : 'Not connected'}
                  </span>
                  {k.source !== 'none' && <span className="text-xs text-ink-3">from {k.source === 'env' ? 'Vercel environment variable' : 'this dashboard'}</span>}
                  <a href={KEY_HELP[p].url} target="_blank" rel="noreferrer noopener" className="ml-auto text-xs text-accent underline">Get a key at {KEY_HELP[p].label}</a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="field min-w-0 flex-1" type="password" autoComplete="off"
                    value={keyDrafts[p] ?? ''} onChange={(e) => setKeyDrafts((d) => ({ ...d, [p]: e.target.value }))}
                    placeholder={k.present ? 'Paste a new key to replace it' : 'Paste your API key'} aria-label={`${NAMES[p]} API key`}
                  />
                  <button className="btn-primary" disabled={!keyDrafts[p]?.trim() || saving !== null} onClick={() => void saveKey(p, keyDrafts[p]!.trim())}>
                    {saving === `${NAMES[p]} key` ? <><Spinner /> Saving…</> : 'Save'}
                  </button>
                  {k.present && (
                    <button className="btn-ghost" disabled={test === 'running'} onClick={() => void runTest(`key-${p}`, p, view.defaults[p].draft)}>
                      {test === 'running' ? <><Spinner /> Testing…</> : 'Test'}
                    </button>
                  )}
                  {k.source === 'dashboard' && (
                    <button className="btn-ghost text-bad" disabled={saving !== null} onClick={() => void saveKey(p, '')}>Remove</button>
                  )}
                </div>
                <TestLine result={test} />
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        icon={<IconRobot />}
        title="2. Model for each task"
        subtitle="Choose which provider and model does each job. The model lists come live from each provider."
        action={
          <button className="btn-primary" disabled={!rolesChanged || saving !== null} onClick={() => void save('Models', { roles })}>
            {saving === 'Models' ? <><Spinner /> Saving…</> : 'Save models'}
          </button>
        }
      >
        <div className="space-y-3">
          {ROLES.map((r) => {
            const choice = roles[r.id];
            const list = models[choice.provider]?.models ?? [];
            const options = list.includes(choice.model) ? list : [choice.model, ...list];
            const test = tests[`role-${r.id}`];
            const noSearch = r.search && choice.provider !== 'gemini';
            return (
              <div key={r.id} className="rounded-xl border border-line p-4">
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h4 className="font-bold">{r.label}</h4>
                  <span className="text-xs text-ink-3">{r.help}</span>
                  <span className="ml-auto text-[11px] text-ink-3">now: {view.roles[r.id].provider}:{view.roles[r.id].model} ({view.roles[r.id].source})</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
                  <select className="field" value={choice.provider} onChange={(e) => setRole(r.id, e.target.value as ProviderId)} aria-label={`${r.label} provider`}>
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p}>{NAMES[p]}{view.keys[p].present ? '' : ' (no key)'}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <select className="field min-w-0 flex-1" value={options.includes(choice.model) ? choice.model : '__custom'}
                            onChange={(e) => e.target.value !== '__custom' && setRole(r.id, choice.provider, e.target.value)} aria-label={`${r.label} model`}>
                      {options.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input className="field w-40" value={choice.model} onChange={(e) => setRole(r.id, choice.provider, e.target.value)}
                           aria-label={`${r.label} model name`} title="Or type any model name" />
                  </div>
                  <button className="btn-ghost" disabled={test === 'running'} onClick={() => void runTest(`role-${r.id}`, choice.provider, choice.model)}>
                    {test === 'running' ? <Spinner /> : 'Test'}
                  </button>
                </div>
                {noSearch && (
                  <p className="mt-2 text-xs text-warn">
                    {NAMES[choice.provider]} cannot search Google from here, so this step will run from the model&apos;s own knowledge. Facts may be out of date.
                  </p>
                )}
                {models[choice.provider]?.error && <p className="mt-2 text-xs text-ink-3">{models[choice.provider]!.error}</p>}
                <TestLine result={test} />
              </div>
            );
          })}
        </div>
        <button className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink" onClick={() => PROVIDERS.forEach((p) => void loadModels(p, true))}>
          <IconRefresh className="h-3.5 w-3.5" /> Refresh model lists
        </button>
      </Panel>

      <Panel
        icon={<IconRefresh />}
        title="3. If a provider fails"
        subtitle="Drag to set the order. When a task's provider fails (bad key, no balance, outage), the next connected provider takes over automatically."
        action={
          <button className="btn-primary" disabled={saving !== null || (order.join() === view.fallbackOrder.join() && strictSearch === view.strictSearch)}
                  onClick={() => void save('Fallback order', { fallbackOrder: order, strictSearch })}>
            {saving === 'Fallback order' ? <><Spinner /> Saving…</> : 'Save order'}
          </button>
        }
      >
        <SortableList
          items={order}
          getKey={(p) => p}
          onChange={setOrder}
          render={(p, i) => (
            <div className="flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
              <span className="font-semibold">{NAMES[p]}</span>
              <span className={`ml-auto text-xs ${view.keys[p].present ? 'text-ok' : 'text-ink-3'}`}>{view.keys[p].present ? 'connected' : 'no key, skipped'}</span>
            </div>
          )}
        />
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={strictSearch} onChange={(e) => setStrictSearch(e.target.checked)} />
          <span>
            <strong>Stop instead of writing without live search.</strong>{' '}
            <span className="text-ink-3">
              Off (recommended): if Gemini fails, research and fact checks switch to the next provider automatically and the
              customer never sees an error. On: those steps stop until Gemini works again, so every article is researched live.
            </span>
          </span>
        </label>
      </Panel>
    </>
  );
}

function TestLine({ result }: { result: TestResult | 'running' | undefined }) {
  if (!result || result === 'running') return null;
  if (result.ok) {
    return (
      <p className="mt-2 text-sm text-ok">
        Working. {result.model ? `${result.model} ` : ''}answered in {(result.ms / 1000).toFixed(1)}s.
      </p>
    );
  }
  return (
    <div className="mt-2">
      <Notice tone="bad">{result.error}</Notice>
      {result.raw && (
        <details className="mt-1 text-xs text-ink-3">
          <summary className="cursor-pointer">Technical details from the provider</summary>
          <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-2 font-mono">{result.raw}</pre>
        </details>
      )}
    </div>
  );
}
