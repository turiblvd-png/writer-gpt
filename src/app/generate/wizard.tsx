'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SEO_MODES, type SeoMode } from '@/lib/content/types';
import { IconAlert, IconCheck, IconChevron, IconClock, IconSpark } from '@/components/icons';

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Arabic', 'Hindi', 'Urdu'];

interface StepRecord {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  logs: string[];
  error?: string;
  durationMs?: number;
}

interface Snapshot {
  runId: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  steps: StepRecord[];
  sources: { uri: string; title?: string }[];
  error?: string;
  state?: { warnings?: string[]; meta?: { seoTitle?: string } };
}

export function GenerateWizard() {
  const router = useRouter();
  const [stage, setStage] = useState<1 | 2 | 3>(1);

  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('English');
  const [seoMode, setSeoMode] = useState<SeoMode>('full-seo');
  const [targetWords, setTargetWords] = useState(1800);
  const [includeFaq, setIncludeFaq] = useState(true);
  const [audience, setAudience] = useState('');
  const [notes, setNotes] = useState('');

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the page cancels the request, which stops the run on the server.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async () => {
    setError(null);
    setSnapshot(null);
    setArticleId(null);
    setStage(3);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, language, seoMode, targetWords, includeFaq, audience, notes }),
        signal: controller.signal,
      });

      // Validation and configuration errors come back as plain JSON.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status}).`);
      }

      // The run streams one JSON event per line for its whole duration.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;

          const event = JSON.parse(line) as { type: string; snapshot?: Snapshot; error?: string; articleId?: string | null };
          if (event.snapshot) setSnapshot(event.snapshot);
          if (event.type === 'done') {
            finished = true;
            setArticleId(event.articleId ?? null);
          }
          if (event.type === 'error') {
            finished = true;
            setError(event.error ?? 'Generation failed.');
          }
        }
      }

      if (!finished) {
        throw new Error('The connection closed before the article finished. The host may have hit its time limit.');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Generation failed.');
    }
  }, [topic, language, seoMode, targetWords, includeFaq, audience, notes]);

  if (stage === 3) {
    return (
      <RunProgress
        snapshot={snapshot}
        error={error}
        onRetry={() => { setStage(1); setSnapshot(null); setError(null); }}
        onOpenArticles={() => router.push(articleId ? `/articles/${articleId}` : '/articles')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Stepper current={stage} />

      {stage === 1 && (
        <section className="card animate-fade-up p-7">
          <header className="mb-6 text-center">
            <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-surface-3 text-accent">
              <IconSpark className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-bold">Configure your first article</h3>
            <p className="mt-1 text-sm text-ink-2">Pick a topic, language, and SEO mode</p>
          </header>

          <label className="label" htmlFor="topic">Topic / Keyword</label>
          <input
            id="topic" className="field" value={topic} autoFocus
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Best AI Writing Tools 2026"
          />

          <label className="label mt-5" htmlFor="language">Language</label>
          <select id="language" className="field" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
          </select>

          <p className="label mt-5">SEO Mode</p>
          <div className="space-y-2">
            {(Object.entries(SEO_MODES) as [SeoMode, { label: string; hint: string }][]).map(([key, mode]) => (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                  seoMode === key ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-line-soft'
                }`}
              >
                <input
                  type="radio" name="seoMode" className="mt-1 accent-accent" checked={seoMode === key}
                  onChange={() => setSeoMode(key)}
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{mode.label}</span>
                  <span className="block text-xs text-ink-3">{mode.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-7 flex gap-3">
            <button className="btn-ghost flex-1" disabled>Back</button>
            <button className="btn-primary flex-1" disabled={topic.trim().length < 3} onClick={() => setStage(2)}>
              Next <IconChevron className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {stage === 2 && (
        <section className="card animate-fade-up p-7">
          <header className="mb-6 text-center">
            <h3 className="text-lg font-bold">Shape the output</h3>
            <p className="mt-1 text-sm text-ink-2">Length, structure and anything the model should know</p>
          </header>

          <label className="label" htmlFor="len">
            Target length, <span className="font-mono text-accent">{targetWords.toLocaleString()}</span> words
          </label>
          <input
            id="len" type="range" min={600} max={4000} step={100} value={targetWords}
            onChange={(e) => setTargetWords(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>600</span><span>4,000</span></div>

          <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
            <input type="checkbox" className="accent-accent" checked={includeFaq} onChange={(e) => setIncludeFaq(e.target.checked)} />
            <span>
              <span className="block text-sm font-semibold text-ink">Include an FAQ section</span>
              <span className="block text-xs text-ink-3">Real questions, answered directly, good for AI Overviews</span>
            </span>
          </label>

          <label className="label mt-5" htmlFor="audience">Audience <span className="font-normal text-ink-3">(optional)</span></label>
          <input id="audience" className="field" value={audience} onChange={(e) => setAudience(e.target.value)}
                 placeholder="e.g. SEO leads at B2B SaaS companies" />

          <label className="label mt-5" htmlFor="notes">Extra instructions <span className="font-normal text-ink-3">(optional)</span></label>
          <textarea id="notes" className="field min-h-[90px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Angle to take, things to avoid, brand voice notes…" />

          <div className="mt-7 flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setStage(1)}>Back</button>
            <button className="btn-primary flex-1" onClick={start}>Generate article</button>
          </div>
        </section>
      )}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="mb-7 flex items-center justify-center gap-2">
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <span
            className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-colors ${
              n < current ? 'bg-accent text-accent-ink'
                : n === current ? 'bg-accent text-accent-ink ring-4 ring-accent/20'
                : 'border border-line bg-surface text-ink-3'
            }`}
          >
            {n < current ? <IconCheck className="h-4 w-4" /> : n}
          </span>
          {n < 3 && <span className={`h-px w-10 ${n < current ? 'bg-accent' : 'bg-line'}`} />}
        </div>
      ))}
    </div>
  );
}

function RunProgress({
  snapshot, error, onRetry, onOpenArticles,
}: {
  snapshot: Snapshot | null;
  error: string | null;
  onRetry: () => void;
  onOpenArticles: () => void;
}) {
  const pct = Math.round((snapshot?.progress ?? 0) * 100);
  const failed = error || snapshot?.status === 'failed' || snapshot?.status === 'cancelled';
  const done = snapshot?.status === 'done';
  const warnings = snapshot?.state?.warnings ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <Stepper current={3} />
      <section className="card animate-fade-up p-7">
        <header className="mb-6 text-center">
          <span
            className={`mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl ${
              failed ? 'bg-bad/15 text-bad' : done ? 'bg-ok/15 text-ok' : 'bg-surface-3 text-accent'
            }`}
          >
            {failed ? <IconAlert className="h-6 w-6" />
              : done ? <IconCheck className="h-6 w-6" />
              : <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />}
          </span>
          <h3 className="text-lg font-bold">
            {failed ? 'Generation failed' : done ? 'Article ready' : 'Writing your article…'}
          </h3>
          <p className="mt-1 text-sm text-ink-2">
            {failed
              ? error ?? snapshot?.error ?? 'Something went wrong.'
              : done
                ? snapshot?.state?.meta?.seoTitle ?? 'Saved to your library.'
                : 'Researching, then drafting from what it finds. Keep this tab open until it finishes.'}
          </p>
        </header>

        {!failed && (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs text-ink-3">{pct}% complete</p>
          </>
        )}

        <ol className="mt-6 space-y-1.5">
          {(snapshot?.steps ?? []).map((step) => (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-xl border p-3 ${
                step.status === 'running' ? 'border-accent/40 bg-accent/5' : 'border-line bg-surface-2'
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {step.status === 'done' ? <IconCheck className="h-4 w-4 text-ok" />
                  : step.status === 'failed' ? <IconAlert className="h-4 w-4 text-bad" />
                  : step.status === 'running' ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                  : <IconClock className="h-4 w-4 text-ink-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${step.status === 'pending' ? 'text-ink-3' : 'text-ink'}`}>
                  {step.title}
                </span>
                {step.logs.length > 0 && (
                  <span className="mt-0.5 block truncate text-xs text-ink-3">{step.logs[step.logs.length - 1]}</span>
                )}
                {step.error && <span className="mt-0.5 block text-xs text-bad">{step.error}</span>}
              </span>
              {step.durationMs != null && (
                <span className="shrink-0 font-mono text-[11px] text-ink-3">{(step.durationMs / 1000).toFixed(1)}s</span>
              )}
            </li>
          ))}
        </ol>

        {warnings.length > 0 && (
          <div className="mt-5 rounded-xl border border-warn/30 bg-warn/10 p-4">
            <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-warn">
              <IconAlert className="h-4 w-4" /> Review before publishing
            </p>
            <ul className="space-y-1 text-xs text-ink-2">
              {warnings.map((w) => <li key={w}>• {w}</li>)}
            </ul>
          </div>
        )}

        {(done || failed) && (
          <div className="mt-6 flex gap-3">
            <button className="btn-ghost flex-1" onClick={onRetry}>Write another</button>
            {done && <button className="btn-primary flex-1" onClick={onOpenArticles}>Open article</button>}
          </div>
        )}
      </section>
    </div>
  );
}
