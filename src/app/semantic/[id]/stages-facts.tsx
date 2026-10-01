'use client';

import { useState } from 'react';
import type { StageApi } from './workspace';
import type { FactStatus, VerifiedFact } from '@/lib/semantic/types';
import { Notice, Panel, Spinner } from '@/components/semantic-ui';
import { IconCheck, IconPlus, IconTrash } from '@/components/icons';

const STATUS: Record<FactStatus, { label: string; style: string; help: string }> = {
  confirmed: { label: 'Confirmed', style: 'bg-ok/15 text-ok', help: 'Ranking pages agree, or a current source states it. The article states it plainly.' },
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
  const researching = busy === 'research-facts' || busy === 'research-facts-live';
  const live = busy === 'research-facts-live';
  const pages = project.data.competitorContent.filter((c) => !c.error && c.text).length;

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
        <div className="flex shrink-0 flex-wrap gap-2">
          <button className="btn-primary px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => void runAction('research-facts')}
                  title="One quick pass over the competitor pages you added">
            {researching && !live ? <><Spinner className="h-3.5 w-3.5" /> Reading pages…</> : facts.length ? 'Refresh from competitors' : 'Get facts from competitors'}
          </button>
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => void runAction('research-facts-live')}
                  title="Adds a live Google search for the very latest details. Slower, up to 90 seconds.">
            {live ? <><Spinner className="h-3.5 w-3.5" /> Searching…</> : 'Check with live search'}
          </button>
        </div>
      }
    >
      {researching && (
        <Notice tone="info">
          {live
            ? 'Searching current sources, then reading the competitor pages. Up to about a minute and a half.'
            : `Reading ${pages || 'the'} competitor page${pages === 1 ? '' : 's'}. Usually 10 to 20 seconds.`}
        </Notice>
      )}
      {sheet && sheet.method !== 'live' && pages > 0 && !researching && (
        <p className="mb-3 text-xs text-ink-3">
          Taken from {pages} competitor page{pages === 1 ? '' : 's'}. Facts two or more pages agree on count as confirmed. For the very latest
          details (new prices, a change of date), use Check with live search.
        </p>
      )}
      {sheet && sheet.method !== 'live' && pages === 0 && !researching && (
        <Notice tone="warn">
          No competitor pages and no live search result, so no fact could be confirmed. Add facts you know are right below.
        </Notice>
      )}

      {facts.length === 0 && !researching && (
        <p className="mb-3 text-sm text-ink-3">
          No fact sheet yet. Get it now, or it is taken from the competitor pages automatically when you generate the article.
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
