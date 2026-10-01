'use client';

import { readJson } from '@/lib/http/read-json';
import { useState } from 'react';
import { Notice, Panel, Spinner, StatTile } from '@/components/semantic-ui';
import { IconCheck, IconCopy, IconGlobe, IconLink, IconPlus, IconTrash, IconWand } from '@/components/icons';
import { renderMarkdown } from '@/lib/content/render';
import { WORD_COUNT_OPTIONS, type BrandVoice, type RewrittenArticle } from '@/lib/rewrite/types';

const LANGUAGES = ['same', 'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Arabic', 'Hindi', 'Urdu'];

const STEPS = [
  { n: '01', label: 'Paste URL' },
  { n: '02', label: 'Keep facts' },
  { n: '03', label: 'Rewrite' },
];

export function RewriteWorkspace({
  voices: initialVoices, initialHistory,
}: {
  voices: BrandVoice[];
  initialHistory: RewrittenArticle[];
}) {
  const [voices, setVoices] = useState(initialVoices);
  const [url, setUrl] = useState('');
  const [brandVoiceId, setBrandVoiceId] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('same');
  const [targetWords, setTargetWords] = useState(1000);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RewrittenArticle | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [showVoiceForm, setShowVoiceForm] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, brandVoiceId, targetLanguage, targetWords }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error ?? 'Rewrite failed.');
      setResult(data.article);
      setHistory((h) => [data.article, ...h]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rewrite failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card mb-4 border-accent/25 bg-gradient-to-r from-accent/10 to-accent-2/5 p-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
              <IconWand className="h-3.5 w-3.5" /> Content transformation
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Rewrite from URL</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-2">
              Paste any public article URL. The facts are extracted first, then a new article is written from that
              list in your brand voice, so the wording is yours rather than a paraphrase of theirs.
            </p>
          </div>
          <div className="flex gap-2">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
                <span className="block font-mono text-[11px] text-accent">{s.n}</span>
                <span className="mt-0.5 block text-xs font-semibold text-ink-2">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Panel
        icon={<IconGlobe />}
        title="Source and writing profile"
        subtitle="Works best with public HTML pages such as news, blogs and government pages."
      >
        <label className="label" htmlFor="url">Source URL</label>
        <input
          id="url" className="field" value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && url.trim().length > 4 && !busy) void run(); }}
          placeholder="https://gov.example.com/tax-regulation-update"
        />

        <label className="label mt-5" htmlFor="voice">Brand voice</label>
        <select id="voice" className="field" value={brandVoiceId} onChange={(e) => setBrandVoiceId(e.target.value)}>
          <option value="auto">Automatic, inferred from source</option>
          {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <p className="mt-1.5 text-xs text-ink-3">
          {brandVoiceId === 'auto'
            ? 'Automatic analyses the source page and applies its tone and structure to the rewrite.'
            : voices.find((v) => v.id === brandVoiceId)?.description}
        </p>
        <button className="mt-2 text-xs text-accent hover:underline" onClick={() => setShowVoiceForm((v) => !v)}>
          {showVoiceForm ? 'Cancel' : 'Create a brand voice to reuse across rewrites'}
        </button>

        {showVoiceForm && (
          <NewVoiceForm
            onCreated={(voice) => {
              setVoices((v) => [...v, voice]);
              setBrandVoiceId(voice.id);
              setShowVoiceForm(false);
            }}
          />
        )}

        <label className="label mt-5" htmlFor="lang">Target language</label>
        <select id="lang" className="field" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l === 'same' ? 'Same as source (auto-detect)' : l}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-ink-3">Keep the source language or choose a different one for the rewrite.</p>

        <label className="label mt-5" htmlFor="words">Target word count</label>
        <select id="words" className="field" value={targetWords} onChange={(e) => setTargetWords(Number(e.target.value))}>
          {WORD_COUNT_OPTIONS.map((w) => <option key={w} value={w}>{w.toLocaleString()}</option>)}
        </select>

        {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}

        <button className="btn-primary mt-5 w-full py-3.5" disabled={busy || url.trim().length < 5} onClick={run}>
          {busy ? <><Spinner /> Rewriting…</> : <><IconWand className="h-4 w-4" /> Rewrite in my brand voice</>}
        </button>
        <p className="mt-2.5 text-center text-xs text-ink-3">
          Only rewrite content you have the right to reuse. This uses one article from your quota.
        </p>
      </Panel>

      {busy && (
        <Panel icon={<Spinner />} title="Working">
          <ol className="space-y-2 text-sm text-ink-2">
            <li>Fetching and extracting the source page</li>
            <li>Pulling out every fact that must survive</li>
            <li>Writing a new article from those facts, not from their sentences</li>
            <li>Measuring similarity and repairing AI patterns</li>
          </ol>
        </Panel>
      )}

      {result && <ResultPanel result={result} />}

      {history.length > 0 && (
        <section className="card mt-4 p-6">
          <h3 className="mb-4 font-bold">Rewritten articles</h3>
          <ul className="space-y-2">
            {history.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
                <button className="min-w-0 flex-1 text-left" onClick={() => setResult(a)}>
                  <span className="block truncate text-sm font-medium text-ink hover:text-accent">{a.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-3">
                    {a.sourceDomain} · {a.words.toLocaleString()} words · {a.language}
                  </span>
                </button>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">
                  {Math.round(a.similarityToSource * 100)}% overlap
                </span>
                <button
                  onClick={async () => {
                    await fetch(`/api/rewrite/articles/${a.id}`, { method: 'DELETE' });
                    setHistory((list) => list.filter((x) => x.id !== a.id));
                    setResult((r) => (r?.id === a.id ? null : r));
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-bad/10 hover:text-bad"
                  aria-label={`Delete ${a.title}`}
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function NewVoiceForm({ onCreated }: { onCreated: (v: BrandVoice) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-4">
      <label className="label" htmlFor="vname">Voice name</label>
      <input id="vname" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="House voice" />

      <label className="label mt-3" htmlFor="vdesc">How it should sound</label>
      <textarea
        id="vdesc" className="field min-h-[80px] resize-y" value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short sentences. Addresses the reader as you. Prices and dates up front. Never hypes anything."
      />

      {error && <p className="mt-2 text-sm text-bad">{error}</p>}

      <button
        className="btn-primary mt-3 w-full"
        disabled={busy || name.trim().length < 2 || description.trim().length < 10}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch('/api/rewrite/voices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, description }),
            });
            const data = await readJson(res);
            if (!res.ok) throw new Error(data.error ?? 'Could not save the voice.');
            onCreated(data.voice);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save the voice.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner /> : <><IconPlus className="h-4 w-4" /> Save voice</>}
      </button>
    </div>
  );
}

function ResultPanel({ result }: { result: RewrittenArticle }) {
  const [copied, setCopied] = useState(false);
  const overlap = Math.round(result.similarityToSource * 100);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Words" value={result.words.toLocaleString()} />
        <StatTile label="Human score" value={`${result.humanScore}/100`} tone={result.humanScore >= 80 ? 'ok' : 'warn'} />
        <StatTile label="Source overlap" value={`${overlap}%`} tone={overlap < 10 ? 'ok' : overlap < 25 ? 'warn' : 'bad'} />
        <StatTile label="Language" value={result.language} />
      </div>

      {result.factWarnings.length > 0 && (
        <Notice tone="warn">
          <p className="mb-1.5 font-semibold">Check before publishing:</p>
          <ul className="space-y-1 text-xs">
            {result.factWarnings.map((w) => <li key={w}>• {w}</li>)}
          </ul>
        </Notice>
      )}

      <Panel
        icon={<IconLink />}
        title={result.title}
        subtitle={`Rewritten from ${result.sourceDomain}`}
        action={
          <button
            className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(result.markdown).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              });
            }}
          >
            {copied ? <><IconCheck className="h-3.5 w-3.5" /> Copied</> : <><IconCopy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        }
      >
        <article className="prose-article max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }} />
      </Panel>
    </>
  );
}
