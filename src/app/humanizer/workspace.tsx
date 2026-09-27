'use client';

import { useMemo, useState } from 'react';
import { Notice, Panel, Spinner, StatTile } from '@/components/semantic-ui';
import { IconAlert, IconCheck, IconCopy, IconDoc, IconRefresh, IconSearch, IconTrash, IconWand } from '@/components/icons';
import { renderMarkdown } from '@/lib/content/render';
import { MAX_WORDS, MIN_WORDS, STEALTH_MODES, creditsFor, type StealthMode } from '@/lib/humanizer/types';
import type { HumanizedArticle } from '@/lib/humanizer/types';

const LANGUAGES = ['auto', 'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Arabic', 'Hindi', 'Urdu'];

interface ArticleRef { id: string; title: string; words: number }

export function HumanizerWorkspace({
  articles, initialHistory,
}: {
  articles: ArticleRef[];
  initialHistory: HumanizedArticle[];
}) {
  const [mode, setMode] = useState<StealthMode>('medium');
  const [language, setLanguage] = useState('auto');
  const [source, setSource] = useState<'paste' | 'article'>('paste');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [articleId, setArticleId] = useState('');

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HumanizedArticle | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [query, setQuery] = useState('');

  const words = useMemo(() => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length, [text]);
  const selected = articles.find((a) => a.id === articleId);
  const effectiveWords = source === 'article' ? (selected?.words ?? 0) : words;
  const canRun = source === 'article'
    ? Boolean(articleId)
    : words >= MIN_WORDS && words <= MAX_WORDS;

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress('Analysing the text…');

    try {
      const res = await fetch('/api/humanizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: source === 'article' ? 'placeholder' : text,
          sourceArticleId: source === 'article' ? articleId : undefined,
          mode, language, title: title.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Humanization failed.');

      setResult(data.article);
      setHistory((h) => [data.article, ...h]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Humanization failed.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const filtered = history.filter((h) => h.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <section className="card mb-4 border-accent/25 bg-gradient-to-r from-accent/10 to-accent-2/5 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent">
            <IconWand className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold tracking-tight">
              Turn AI text into writing that reads as human
            </h2>
            <p className="mt-1 text-sm text-ink-2">Paste content or choose one of your articles.</p>
          </div>
          <span className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2">
            AI Humanizer
          </span>
        </div>
      </section>

      <Panel
        icon={<IconWand />}
        title="Choose your Stealth mode"
        subtitle="Deeper modes cost more and rewrite further. Your article language is preserved."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.entries(STEALTH_MODES) as [StealthMode, typeof STEALTH_MODES[StealthMode]][]).map(([key, m]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              aria-pressed={mode === key}
              className={`rounded-xl border p-4 text-left transition-colors ${
                mode === key ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-line-soft'
              }`}
            >
              <span className={`block text-sm font-bold ${mode === key ? 'text-accent' : 'text-ink'}`}>{m.label}</span>
              <span className="mt-0.5 block text-xs text-ink-3">{m.hint}</span>
              <span className="mt-2 block font-mono text-[11px] text-ink-3">
                {m.creditMultiplier}× credits · target {m.threshold}/100
              </span>
            </button>
          ))}
        </div>
        {effectiveWords > 0 && (
          <p className="mt-3 text-xs text-ink-3">
            {effectiveWords.toLocaleString()} words ≈{' '}
            <span className="font-mono text-accent">{creditsFor(effectiveWords, mode)}</span> credits in {STEALTH_MODES[mode].label}.
          </p>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel icon={<IconDoc />} title="Source" subtitle="Paste content or choose one of your articles.">
          <label className="label" htmlFor="lang">Content language</label>
          <select id="lang" className="field" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l === 'auto' ? 'Automatic (detect)' : l}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-3">
            Automatic detects the language from the text, so a Spanish draft is not rewritten into English.
          </p>

          <div className="mt-4 flex gap-1 rounded-xl bg-surface-2 p-1">
            {(['paste', 'article'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  source === s ? 'bg-gradient-to-r from-accent to-accent-2 text-accent-ink' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {s === 'paste' ? 'Paste text' : 'My article'}
              </button>
            ))}
          </div>

          {source === 'paste' ? (
            <>
              <label className="label mt-4" htmlFor="title">Optional title</label>
              <input id="title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />

              <textarea
                className="field mt-4 min-h-[320px] resize-y font-mono text-xs leading-relaxed"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Paste ${MIN_WORDS}-${MAX_WORDS.toLocaleString()} words here…`}
                aria-label="Text to humanize"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-3">
                  Allowed: {MIN_WORDS}–{MAX_WORDS.toLocaleString()} words
                </span>
                <span className={`font-mono text-xs ${
                  words > MAX_WORDS ? 'text-bad' : words >= MIN_WORDS ? 'text-ok' : 'text-ink-3'
                }`}>
                  {words.toLocaleString()} words
                </span>
              </div>
            </>
          ) : (
            <div className="mt-4">
              {articles.length === 0 ? (
                <Notice tone="warn">No saved articles yet. Generate one first, or paste text instead.</Notice>
              ) : (
                <ul className="max-h-[360px] space-y-1.5 overflow-y-auto">
                  {articles.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => setArticleId(a.id)}
                        aria-pressed={articleId === a.id}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                          articleId === a.id ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-line-soft'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-ink-3">{a.words.toLocaleString()}w</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <Notice tone="bad">{error}</Notice>}

          <button className="btn-primary mt-4 w-full py-3" disabled={busy || !canRun} onClick={run}>
            {busy ? <><Spinner /> Humanizing…</> : <><IconWand className="h-4 w-4" /> Humanize</>}
          </button>
          {!canRun && source === 'paste' && words > 0 && (
            <p className="mt-2 text-center text-xs text-ink-3">
              {words < MIN_WORDS ? `${MIN_WORDS - words} more words needed.` : `${(words - MAX_WORDS).toLocaleString()} words over the limit.`}
            </p>
          )}
        </Panel>

        <Panel icon={<IconCheck />} title="Humanized content">
          {busy ? (
            <div className="grid place-items-center gap-3 py-20 text-center">
              <Spinner className="h-8 w-8" />
              <p className="text-sm text-ink-2">{progress ?? 'Working…'}</p>
            </div>
          ) : result ? (
            <ResultPanel result={result} />
          ) : (
            <div className="grid place-items-center gap-3 py-20 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-line text-ink-3">
                <IconWand className="h-6 w-6" />
              </span>
              <p className="font-semibold text-ink-2">Your humanized draft will appear here</p>
              <p className="max-w-xs text-sm text-ink-3">
                Pick or paste your content, then run it to see the before and after scores.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <section className="card mt-4 p-6">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <IconDoc className="h-4 w-4 text-accent" />
          <div className="min-w-0 flex-1">
            <h3 className="font-bold">Humanized articles</h3>
            <p className="mt-0.5 text-sm text-ink-3">Saved here automatically and kept separate from My Articles.</p>
          </div>
          <span className="font-mono text-xs text-ink-3">Articles: {history.length}</span>
        </header>

        <div className="relative mb-4">
          <IconSearch className="absolute left-3 top-3.5 h-4 w-4 text-ink-3" />
          <input
            className="field pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search humanized articles…"
            aria-label="Search humanized articles"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-line py-14 text-center">
            <IconDoc className="h-6 w-6 text-ink-3" />
            <p className="font-semibold text-ink-2">
              {history.length ? 'Nothing matches that search' : 'No humanized articles yet'}
            </p>
            <p className="text-sm text-ink-3">Your next successful result will appear here automatically.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
                <button className="min-w-0 flex-1 text-left" onClick={() => setResult(h)}>
                  <span className="block truncate text-sm font-medium text-ink hover:text-accent">{h.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-3">
                    {STEALTH_MODES[h.mode].label} · {h.language} · {h.words.toLocaleString()} words
                  </span>
                </button>
                <span className="shrink-0 font-mono text-xs">
                  <span className="text-ink-3">{h.scoreBefore}</span>
                  <span className="mx-1 text-ink-3">→</span>
                  <span className={h.scoreAfter >= 80 ? 'text-ok' : 'text-warn'}>{h.scoreAfter}</span>
                </span>
                <button
                  onClick={async () => {
                    await fetch(`/api/humanizer/articles/${h.id}`, { method: 'DELETE' });
                    setHistory((list) => list.filter((x) => x.id !== h.id));
                    setResult((r) => (r?.id === h.id ? null : r));
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-bad/10 hover:text-bad"
                  aria-label={`Delete ${h.title}`}
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ResultPanel({ result }: { result: HumanizedArticle }) {
  const [tab, setTab] = useState<'result' | 'diff'>('result');
  const [copied, setCopied] = useState(false);
  const gain = result.scoreAfter - result.scoreBefore;

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatTile label="Before" value={`${result.scoreBefore}/100`} tone={result.scoreBefore >= 75 ? 'ok' : 'bad'} />
        <StatTile label="After" value={`${result.scoreAfter}/100`} tone={result.scoreAfter >= 80 ? 'ok' : 'warn'} />
        <StatTile label="Improvement" value={gain > 0 ? `+${gain}` : String(gain)} tone={gain > 0 ? 'ok' : 'warn'} />
      </div>

      {result.tellsAfter.length > 0 ? (
        <Notice tone="warn">
          <p className="mb-1 font-semibold">Patterns still present:</p>
          <p className="text-xs">{result.tellsAfter.join(' · ')}</p>
        </Notice>
      ) : result.tellsBefore.length > 0 ? (
        <Notice tone="ok">
          Removed: <span className="text-xs">{result.tellsBefore.join(' · ')}</span>
        </Notice>
      ) : null}

      <div className="mb-3 flex gap-1 border-b border-line">
        {(['result', 'diff'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            {t === 'result' ? 'Result' : 'Compare'}
          </button>
        ))}
      </div>

      {tab === 'result' ? (
        <article
          className="prose-article max-h-[520px] max-w-none overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(result.humanizedText) }}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Original</p>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-3">
              {result.sourceText}
            </pre>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">Humanized</p>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-2">
              {result.humanizedText}
            </pre>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="btn-ghost flex-1"
          onClick={() => {
            void navigator.clipboard?.writeText(result.humanizedText).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          {copied ? <><IconCheck className="h-4 w-4" /> Copied</> : <><IconCopy className="h-4 w-4" /> Copy</>}
        </button>
        <a
          className="btn-ghost flex-1"
          download={`${result.title.replace(/[^\w\s-]/g, '').slice(0, 60) || 'humanized'}.md`}
          href={`data:text/markdown;charset=utf-8,${encodeURIComponent(result.humanizedText)}`}
        >
          <IconRefresh className="h-4 w-4 rotate-90" /> Download
        </a>
      </div>
    </>
  );
}
