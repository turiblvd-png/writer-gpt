'use client';

import { useState } from 'react';
import type { StageApi } from './workspace';
import { Notice, Panel, Spinner } from '@/components/semantic-ui';
import { IconGlobe, IconLink, IconPlus, IconRefresh, IconTarget, IconTrash } from '@/components/icons';
import { normaliseUrl, safeDomain } from '@/lib/semantic/url';
import type { OutlineHeading } from '@/lib/semantic/types';

const MAX_COMPETITORS = 5;

export function CompetitorResearchStage({ api }: { api: StageApi }) {
  const { project, patch } = api;
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const competitors = project.data.competitors;

  function add() {
    const value = url.trim();
    if (!value) return;

    const normalised = normaliseUrl(value);
    try {
      new URL(normalised);
    } catch {
      setUrlError('That is not a valid URL.');
      return;
    }
    if (competitors.some((c) => c.url === normalised)) {
      setUrlError('That URL is already in the list.');
      return;
    }
    if (competitors.length >= MAX_COMPETITORS) {
      setUrlError(`You can analyse up to ${MAX_COMPETITORS} competitors.`);
      return;
    }

    setUrl('');
    setUrlError(null);
    void patch({ competitors: [...competitors, { url: normalised, domain: safeDomain(normalised) }] });
  }

  function remove(target: string) {
    void patch({
      competitors: competitors.filter((c) => c.url !== target),
      // Drop derived results for a URL that is no longer part of the project.
      outlines: project.data.outlines.filter((o) => o.url !== target),
      competitorContent: project.data.competitorContent.filter((c) => c.url !== target),
    });
  }

  return (
    <>
      <Panel icon={<IconGlobe />} title="Content language" subtitle="Everything downstream uses this language.">
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm">{project.language}</p>
      </Panel>

      <Panel icon={<IconTarget />} title="Main Keyword" subtitle="The primary keyword to optimize for">
        <input
          className="field"
          value={project.mainKeyword}
          readOnly
          aria-label="Main keyword"
        />
        <p className="mt-2 text-xs text-ink-3">
          Set when the project was created, so every stage stays consistent with it.
        </p>
      </Panel>

      <Panel
        icon={<IconLink />}
        title="Competitor URLs"
        subtitle={`Add up to ${MAX_COMPETITORS} competitor URLs to analyze`}
      >
        <div className="flex gap-2">
          <input
            className="field"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder="https://competitor.com/article"
            aria-label="Competitor URL"
          />
          <button className="btn-ghost shrink-0" onClick={add} disabled={competitors.length >= MAX_COMPETITORS}>
            <IconPlus className="h-4 w-4" /> Add
          </button>
        </div>
        {urlError && <p className="mt-2 text-sm text-bad">{urlError}</p>}

        {competitors.length > 0 && (
          <ul className="mt-4 space-y-2">
            {competitors.map((c) => (
              <li key={c.url} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <IconGlobe className="h-4 w-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{c.url}</span>
                <button
                  onClick={() => remove(c.url)}
                  className="shrink-0 rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-bad/10 hover:text-bad"
                  aria-label={`Remove ${c.domain}`}
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {competitors.length === 0 && (
          <p className="mt-4 text-sm text-ink-3">
            Add the pages currently ranking for your keyword. Every later stage measures against them.
          </p>
        )}
      </Panel>
    </>
  );
}

export function OutlineStage({ api }: { api: StageApi }) {
  const { project, patch, runAction, busy } = api;
  const { competitors, outlines, combinedOutline } = project.data;
  const [heading, setHeading] = useState('');
  const [level, setLevel] = useState(2);

  function addHeading() {
    const text = heading.trim();
    if (!text) return;
    setHeading('');
    void patch({ combinedOutline: [...combinedOutline, { level, text }] });
  }

  function removeHeading(index: number) {
    void patch({ combinedOutline: combinedOutline.filter((_, i) => i !== index) });
  }

  function move(index: number, delta: number) {
    const next = [...combinedOutline];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void patch({ combinedOutline: next });
  }

  return (
    <>
      <Panel icon={<IconLink />} title="Extract Outlines from Competitors">
        {competitors.length === 0 ? (
          <Notice tone="warn">Add competitor URLs in the previous step first.</Notice>
        ) : (
          <>
            <ul className="space-y-2">
              {competitors.map((c) => {
                const result = outlines.find((o) => o.url === c.url);
                const thisBusy = busy === 'extract-outlines';
                return (
                  <li key={c.url} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{c.domain}</span>
                      {result && (
                        <span className={`mt-0.5 block text-xs ${result.error ? 'text-bad' : 'text-ok'}`}>
                          {result.error ?? `${result.headings.length} headings extracted`}
                        </span>
                      )}
                    </span>
                    <button
                      className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                      disabled={thisBusy}
                      onClick={() => runAction('extract-outlines', { urls: [c.url] })}
                    >
                      {thisBusy ? <Spinner className="h-3.5 w-3.5" /> : 'Extract Outlines'}
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              className="btn-ghost mt-3 w-full"
              disabled={busy === 'extract-outlines'}
              onClick={() => runAction('extract-outlines')}
            >
              {busy === 'extract-outlines' ? <><Spinner /> Extracting…</> : <><IconLink className="h-4 w-4" /> Extract All Outlines</>}
            </button>

            <button
              className="btn-primary mt-2 w-full"
              disabled={busy === 'combine-outlines' || !outlines.some((o) => o.headings.length)}
              onClick={() => runAction('combine-outlines')}
            >
              {busy === 'combine-outlines' ? <><Spinner /> Combining…</> : 'Combine Outlines with AI'}
            </button>
          </>
        )}
      </Panel>

      <Panel
        icon={<IconTarget />}
        title="Combined Outline"
        subtitle={combinedOutline.length ? `${combinedOutline.length} headings` : undefined}
      >
        {combinedOutline.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">
            No headings yet. Extract from competitors or add manually.
          </p>
        ) : (
          <ol className="mb-4 space-y-1">
            {combinedOutline.map((h, i) => (
              <li
                key={`${i}-${h.text}`}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"
                style={{ paddingLeft: `${(h.level - 1) * 16 + 8}px` }}
              >
                <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-3">
                  H{h.level}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{h.text}</span>
                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => move(i, -1)} className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Move up">↑</button>
                  <button onClick={() => move(i, 1)} className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Move down">↓</button>
                  <button onClick={() => removeHeading(i)} className="rounded p-1 text-ink-3 hover:text-bad" aria-label="Remove heading">
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex gap-2">
          <input
            className="field"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addHeading(); }}
            placeholder="Add new heading…"
            aria-label="New heading"
          />
          <select
            className="field w-24 shrink-0"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            aria-label="Heading level"
          >
            {[1, 2, 3, 4].map((l) => <option key={l} value={l}>H{l}</option>)}
          </select>
          <button className="btn-primary shrink-0" onClick={addHeading}>
            <IconPlus className="h-4 w-4" /> Add
          </button>
        </div>
      </Panel>
    </>
  );
}

export function WordCountStage({ api }: { api: StageApi }) {
  const { project, patch } = api;
  const { wordCount } = project.data;

  return (
    <Panel icon={<IconTarget />} title="Target word count" subtitle="Optional — auto follows the competitor average.">
      <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
        <input
          type="checkbox"
          className="accent-accent"
          checked={wordCount.auto}
          onChange={(e) => {
            const auto = e.target.checked;
            const average = wordCount.competitorAverage;
            void patch({
              wordCount: {
                ...wordCount,
                auto,
                // Snapping back to the derived target makes the toggle meaningful.
                target: auto && average
                  ? Math.min(6000, Math.max(800, Math.round((average * 1.15) / 50) * 50))
                  : wordCount.target,
              },
            });
          }}
        />
        <span>
          <span className="block text-sm font-semibold text-ink">Match the competitors automatically</span>
          <span className="block text-xs text-ink-3">
            {wordCount.competitorAverage
              ? `Competitor average is ${wordCount.competitorAverage.toLocaleString()} words — target is set 15% above.`
              : 'Extract competitor content first and the average will appear here.'}
          </span>
        </span>
      </label>

      <label className="label" htmlFor="target">
        Target length — <span className="font-mono text-accent">{wordCount.target.toLocaleString()}</span> words
      </label>
      <input
        id="target"
        type="range"
        min={600}
        max={5000}
        step={50}
        value={wordCount.target}
        disabled={wordCount.auto}
        onChange={(e) => void patch({ wordCount: { ...wordCount, target: Number(e.target.value) } })}
        className="w-full accent-accent disabled:opacity-40"
      />
      <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>600</span><span>5,000</span></div>

      <Notice tone="info">
        Length is not a ranking factor by itself. Under-covering what competitors cover is the real risk, and padding
        past them adds nothing.
      </Notice>
    </Panel>
  );
}

export function CompetitorContentStage({ api }: { api: StageApi }) {
  const { project, runAction, busy } = api;
  const { competitors, competitorContent, contentAnalysis } = project.data;
  const extracted = competitorContent.filter((c) => !c.error && c.words > 0);

  return (
    <>
      <Notice tone="info">
        This step is optional. Add competitor content if you want the AI to analyse and match its writing style —
        and it is what N-Grams, NLP Keywords and Skip-Grams are measured from.
      </Notice>

      <Panel icon={<IconGlobe />} title="Extract Content from Competitors">
        {competitors.length === 0 ? (
          <Notice tone="warn">Add competitor URLs in step 1 first.</Notice>
        ) : (
          <>
            <button
              className="btn-primary mb-3 w-full"
              disabled={busy === 'extract-content'}
              onClick={() => runAction('extract-content')}
            >
              {busy === 'extract-content' ? <><Spinner /> Extracting…</> : <><IconGlobe className="h-4 w-4" /> Extract All Content</>}
            </button>

            <ul className="space-y-2">
              {competitors.map((c) => {
                const result = competitorContent.find((x) => x.url === c.url);
                return (
                  <li key={c.url} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-2">{c.url}</span>
                      {result && (
                        <span className={`mt-0.5 block text-xs ${result.error ? 'text-bad' : 'text-ok'}`}>
                          {result.error ?? `${result.words.toLocaleString()} words extracted`}
                        </span>
                      )}
                    </span>
                    <button
                      className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                      disabled={busy === 'extract-content'}
                      onClick={() => runAction('extract-content', { urls: [c.url] })}
                    >
                      Extract
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      {extracted.length > 0 && (
        <Panel
          icon={<IconRefresh />}
          title="Writing style analysis"
          subtitle={`${extracted.reduce((s, c) => s + c.words, 0).toLocaleString()} words of corpus`}
          action={
            <button
              className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
              disabled={busy === 'analyse-style'}
              onClick={() => runAction('analyse-style')}
            >
              {busy === 'analyse-style' ? <Spinner className="h-3.5 w-3.5" /> : contentAnalysis ? 'Re-analyse' : 'Analyse style'}
            </button>
          }
        >
          {contentAnalysis
            ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{contentAnalysis}</p>
            : <p className="text-sm text-ink-3">Not analysed yet.</p>}
        </Panel>
      )}
    </>
  );
}

export type { OutlineHeading };
