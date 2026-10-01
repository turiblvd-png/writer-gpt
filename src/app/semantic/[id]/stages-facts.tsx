'use client';

import { useState } from 'react';
import type { StageApi } from './workspace';
import type { FactStatus, VerifiedFact } from '@/lib/semantic/types';
import { Notice, Panel, Spinner } from '@/components/semantic-ui';
import { IconCheck, IconPlus, IconTrash } from '@/components/icons';

const STATUS: Record<FactStatus, { label: string; style: string; help: string }> = {
  confirmed: { label: 'Confirmed', style: 'bg-ok/15 text-ok', help: 'A current source states it. The article states it plainly.' },
  reported: { label: 'Reported', style: 'bg-info/15 text-info', help: 'Only a ranking page says it. The article attributes it.' },
  conflicting: { label: 'Conflicting', style: 'bg-warn/15 text-warn', help: 'Sources disagree. The article gives both.' },
  unconfirmed: { label: 'Not confirmed', style: 'bg-surface-3 text-ink-3', help: 'Nobody states it yet. The article says so.' },
};

const ORDER: FactStatus[] = ['confirmed', 'reported', 'conflicting', 'unconfirmed'];

/**
 * The fact sheet: every specific the writer may use. Research fills it; the
 * user can remove anything wrong and add what they know, which is kept when
 * the research is re-run.
 */
export function FactsPanel({ api }: { api: StageApi }) {
  const { project, patch, runAction, busy } = api;
  const sheet = project.data.facts;
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const researching = busy === 'research-facts';

  function save(facts: VerifiedFact[]) {
    void patch({
      facts: { facts, sources: sheet?.sources ?? [], liveSearch: sheet?.liveSearch ?? false, researchedAt: sheet?.researchedAt ?? Date.now() },
    });
  }

  function add() {
    if (!label.trim() || !value.trim()) return;
    const fact: VerifiedFact = { id: crypto.randomUUID(), label: label.trim(), value: value.trim(), status: 'confirmed', source: 'Added by you', manual: true };
    save([fact, ...(sheet?.facts ?? [])]);
    setLabel('');
    setValue('');
  }

  const facts = sheet?.facts ?? [];

  return (
    <Panel
      icon={<IconCheck />}
      title="Verified facts"
      subtitle="The only place the writer may take a date, price, name or number from. Remove anything wrong; add what you know."
      action={
        <button className="btn-primary px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => void runAction('research-facts')}>
          {researching ? <><Spinner className="h-3.5 w-3.5" /> Researching…</> : facts.length ? 'Re-research' : 'Research facts'}
        </button>
      }
    >
      {researching && <Notice tone="info">Searching current sources and reading the competitor pages. Usually 20 to 60 seconds.</Notice>}
      {sheet && !sheet.liveSearch && (
        <Notice tone="warn">
          Live Google Search was unavailable, so no fact could be independently confirmed. The article will attribute each one to the
          page that states it. Add facts you know are right as confirmed below.
        </Notice>
      )}

      {facts.length === 0 && !researching && (
        <p className="mb-3 text-sm text-ink-3">
          No fact sheet yet. Research it now, or it runs automatically when you generate the article.
        </p>
      )}

      {ORDER.map((status) => {
        const group = facts.filter((f) => f.status === status);
        if (!group.length) return null;
        return (
          <div key={status} className="mb-4">
            <p className="mb-1.5 flex items-center gap-2 text-xs">
              <span className={`rounded-md px-2 py-0.5 font-bold uppercase ${STATUS[status].style}`}>{STATUS[status].label} · {group.length}</span>
              <span className="text-ink-3">{STATUS[status].help}</span>
            </p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {group.map((f) => (
                <li key={f.id} className="flex items-start gap-3 p-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{f.label}:</span> {f.value}
                    {(f.source || f.url) && (
                      <span className="block text-xs text-ink-3">
                        {f.url ? <a href={f.url} target="_blank" rel="noreferrer noopener" className="hover:text-accent hover:underline">{f.source || f.url}</a> : f.source}
                      </span>
                    )}
                  </span>
                  <button className="rounded-lg p-1 text-ink-3 hover:text-bad" onClick={() => save(facts.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.label}`}>
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
        <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Fact, e.g. 2026 dates" aria-label="Fact label" />
        <input className="field" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value, e.g. 15-18 October 2026"
               aria-label="Fact value" onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn-ghost" disabled={!label.trim() || !value.trim()} onClick={add}><IconPlus className="h-4 w-4" /> Add</button>
      </div>

      {sheet && sheet.sources.length > 0 && (
        <details className="mt-3 text-xs text-ink-3">
          <summary className="cursor-pointer">{sheet.sources.length} citable sources</summary>
          <ul className="mt-1.5 space-y-0.5">
            {sheet.sources.map((s) => <li key={`${s.name}${s.url}`}>{s.name}{s.url && <> · <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline">{s.url}</a></>}</li>)}
          </ul>
        </details>
      )}
    </Panel>
  );
}
