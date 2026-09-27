'use client';

import { useMemo, useState } from 'react';
import type { StageApi } from './workspace';
import { Chip, Notice, Panel, Spinner, StatTile } from '@/components/semantic-ui';
import { IconGraph, IconHub, IconList, IconRefresh, IconSpark, IconTag, IconTarget } from '@/components/icons';
import type { EntitySource } from '@/lib/semantic/types';

/** Toggle a value in an exclusion list. */
function toggle(list: string[], value: string): string[] {
  const key = value.toLowerCase();
  return list.some((x) => x.toLowerCase() === key)
    ? list.filter((x) => x.toLowerCase() !== key)
    : [...list, value];
}

const isExcluded = (list: string[], value: string) =>
  list.some((x) => x.toLowerCase() === value.toLowerCase());

export function EntitiesStage({ api }: { api: StageApi }) {
  const { project, patch, runAction, busy } = api;
  const { entities, excludedEntities, competitorContent } = project.data;

  const columns: { source: EntitySource; title: string; icon: React.ReactNode; tone: 'accent' | 'info' | 'ok' }[] = [
    { source: 'competitor', title: 'Competitor', icon: <IconHub className="h-4 w-4" />, tone: 'accent' },
    { source: 'ai', title: 'AI suggested', icon: <IconSpark className="h-4 w-4" />, tone: 'info' },
    { source: 'unique', title: 'Unique', icon: <IconTarget className="h-4 w-4" />, tone: 'ok' },
  ];

  const hasCorpus = competitorContent.some((c) => !c.error && c.words > 0);

  return (
    <>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <button className="btn-primary" disabled={Boolean(busy)} onClick={() => runAction('generate-entities', { scope: 'all' })}>
          {busy === 'generate-entities' ? <><Spinner /> Generating…</> : <><IconSpark className="h-4 w-4" /> Generate All</>}
        </button>
        {columns.map((c) => (
          <button
            key={c.source}
            className="btn-ghost"
            disabled={Boolean(busy)}
            onClick={() => runAction('generate-entities', { scope: c.source })}
          >
            {c.icon} {c.title}
          </button>
        ))}
      </div>

      {!hasCorpus && (
        <Notice tone="warn">
          No competitor content extracted, so the &ldquo;Competitor&rdquo; column will be empty and mention counts cannot be
          measured. Run step 4 first for the strongest entity set.
        </Notice>
      )}

      {entities.length > 0 && (
        <Notice tone="info">Click an entity to exclude it from the mega prompt.</Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((col) => {
          const items = entities.filter((e) => e.source === col.source);
          const active = items.filter((e) => !isExcluded(excludedEntities, e.name)).length;

          return (
            <section key={col.source} className="card p-5">
              <header className="mb-4 flex items-center gap-2">
                <span className="text-accent">{col.icon}</span>
                <h4 className="flex-1 font-bold">{col.title}</h4>
                <span className="font-mono text-[11px] text-ink-3">{active}/{items.length}</span>
              </header>

              {items.length === 0 ? (
                <p className="text-sm text-ink-3">Nothing generated yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {items.map((e) => (
                    <Chip
                      key={e.name}
                      label={e.name}
                      tone={col.tone}
                      count={e.documentFrequency ? `${e.documentFrequency}p` : undefined}
                      title={
                        e.documentFrequency
                          ? `Named by ${e.documentFrequency} competitor page(s), ${e.mentions} mentions`
                          : 'Not found in competitor content'
                      }
                      excluded={isExcluded(excludedEntities, e.name)}
                      onClick={() => void patch({ excludedEntities: toggle(excludedEntities, e.name) })}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function NgramsStage({ api }: { api: StageApi }) {
  const { project, patch, runAction, busy } = api;
  const { ngrams, excludedNgrams } = project.data;
  const [size, setSize] = useState<0 | 1 | 2 | 3>(0);

  const shown = useMemo(
    () => (size === 0 ? ngrams : ngrams.filter((g) => g.n === size)).slice(0, 120),
    [ngrams, size],
  );

  return (
    <>
      <Panel
        icon={<IconList />}
        title="N-Gram frequency"
        subtitle="Counted directly from extracted competitor text — no model involved."
        action={
          <button className="btn-primary shrink-0 px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => runAction('compute-ngrams')}>
            {busy === 'compute-ngrams' ? <Spinner className="h-3.5 w-3.5" /> : <><IconRefresh className="h-3.5 w-3.5" /> {ngrams.length ? 'Recompute' : 'Compute'}</>}
          </button>
        }
      >
        {ngrams.length === 0 ? (
          <p className="text-sm text-ink-3">
            Nothing computed yet. Extract competitor content in step 4, then compute.
          </p>
        ) : (
          <>
            <div className="mb-4 flex gap-1">
              {([0, 1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setSize(n)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    size === n ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-3 hover:text-ink'
                  }`}
                >
                  {n === 0 ? 'All' : `${n}-gram`}
                </button>
              ))}
            </div>

            <Notice tone="info">
              Sorted by how many competitor pages use the phrase, not raw count — a phrase every ranking page uses
              matters more than one page&rsquo;s repetition. Click to exclude.
            </Notice>

            <div className="flex flex-wrap gap-1.5">
              {shown.map((g) => (
                <Chip
                  key={g.text}
                  label={g.text}
                  count={`${g.count}×/${g.documents}p`}
                  title={`${g.count} occurrences across ${g.documents} competitor pages`}
                  excluded={isExcluded(excludedNgrams, g.text)}
                  onClick={() => void patch({ excludedNgrams: toggle(excludedNgrams, g.text) })}
                />
              ))}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

export function NlpKeywordsStage({ api }: { api: StageApi }) {
  const { project, patch, runAction, busy } = api;
  const { nlpKeywords, excludedKeywords } = project.data;
  const max = nlpKeywords[0]?.salience ?? 1;

  return (
    <Panel
      icon={<IconTag />}
      title="NLP keyword salience"
      subtitle="TF-IDF against the competitor corpus — distinctiveness, not raw frequency."
      action={
        <button className="btn-primary shrink-0 px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => runAction('compute-keywords')}>
          {busy === 'compute-keywords' ? <Spinner className="h-3.5 w-3.5" /> : <><IconRefresh className="h-3.5 w-3.5" /> {nlpKeywords.length ? 'Recompute' : 'Compute'}</>}
        </button>
      }
    >
      {nlpKeywords.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing computed yet. Extract competitor content in step 4, then compute.</p>
      ) : (
        <ul className="space-y-1.5">
          {nlpKeywords.slice(0, 60).map((k) => {
            const excluded = isExcluded(excludedKeywords, k.term);
            return (
              <li key={k.term}>
                <button
                  onClick={() => void patch({ excludedKeywords: toggle(excludedKeywords, k.term) })}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 ${
                    excluded ? 'opacity-40' : ''
                  }`}
                  aria-pressed={!excluded}
                >
                  <span className={`w-40 shrink-0 truncate text-sm ${excluded ? 'text-ink-3 line-through' : 'text-ink'}`}>
                    {k.term}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                      style={{ width: `${Math.max(3, (k.salience / max) * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-[11px] text-ink-3">{k.salience}</span>
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] text-ink-3">{k.count}×</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function SkipGramStage({ api }: { api: StageApi }) {
  const { project, runAction, busy } = api;
  const { skipGrams } = project.data;

  return (
    <Panel
      icon={<IconGraph />}
      title="Skip-gram co-occurrence"
      subtitle="Word pairs that recur near each other without being adjacent."
      action={
        <button className="btn-primary shrink-0 px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => runAction('compute-skipgrams')}>
          {busy === 'compute-skipgrams' ? <Spinner className="h-3.5 w-3.5" /> : <><IconRefresh className="h-3.5 w-3.5" /> {skipGrams.length ? 'Recompute' : 'Compute'}</>}
        </button>
      }
    >
      {skipGrams.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing computed yet. Extract competitor content in step 4, then compute.</p>
      ) : (
        <>
          <Notice tone="info">
            Adjacent pairs are excluded — n-grams already cover those. What remains are relationships the writer should
            express in a sentence, not just list.
          </Notice>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {skipGrams.slice(0, 60).map((s) => (
              <div key={s.text} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{s.text.replace(' … ', '  ↔  ')}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">{s.count}×</span>
                <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">gap {s.gap}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

export function AutoSuggestStage({ api }: { api: StageApi }) {
  const { project, patch, runAction, busy } = api;
  const { autoSuggest, selectedQuestions } = project.data;
  const selected = selectedQuestions.length ? selectedQuestions : autoSuggest;

  function toggleQuestion(q: string) {
    const current = selectedQuestions.length ? selectedQuestions : autoSuggest;
    const next = current.includes(q) ? current.filter((x) => x !== q) : [...current, q];
    // Empty means "none selected", so keep a sentinel the mega prompt can read.
    void patch({ selectedQuestions: next.length ? next : [''] });
  }

  return (
    <Panel
      icon={<IconSpark />}
      title="Questions & auto-suggest"
      subtitle="Grounded in live search — what people actually ask right now."
      action={
        <button className="btn-primary shrink-0 px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => runAction('generate-questions')}>
          {busy === 'generate-questions' ? <Spinner className="h-3.5 w-3.5" /> : autoSuggest.length ? 'Regenerate' : 'Find questions'}
        </button>
      }
    >
      {autoSuggest.length === 0 ? (
        <p className="text-sm text-ink-3">
          No questions yet. Each one you select becomes a section the article must answer directly.
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink-3">
              {selected.filter(Boolean).length} of {autoSuggest.length} selected
            </p>
            <button
              className="text-xs text-accent hover:underline"
              onClick={() => void patch({ selectedQuestions: selected.filter(Boolean).length ? [''] : autoSuggest })}
            >
              {selected.filter(Boolean).length ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <ul className="space-y-1.5">
            {autoSuggest.map((q) => {
              const on = selected.includes(q);
              return (
                <li key={q}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    on ? 'border-accent/40 bg-accent/[0.07]' : 'border-line bg-surface-2 hover:border-line'
                  }`}>
                    <input type="checkbox" className="mt-0.5 accent-accent" checked={on} onChange={() => toggleQuestion(q)} />
                    <span className={`text-sm ${on ? 'text-ink' : 'text-ink-2'}`}>{q}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

export function CorpusStats({ api }: { api: StageApi }) {
  const extracted = api.project.data.competitorContent.filter((c) => !c.error && c.words > 0);
  if (!extracted.length) return null;

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatTile label="Pages" value={extracted.length} />
      <StatTile label="Corpus words" value={extracted.reduce((s, c) => s + c.words, 0).toLocaleString()} />
      <StatTile label="N-grams" value={api.project.data.ngrams.length} />
      <StatTile label="Entities" value={api.project.data.entities.length} />
    </div>
  );
}
