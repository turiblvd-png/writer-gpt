'use client';

import { readJson } from '@/lib/http/read-json';
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { AutopilotItem, AutopilotStatus } from '@/lib/autopilot/queue';
import { SEO_MODES, type SeoMode } from '@/lib/content/types';
import { Notice, Panel, Spinner, StatTile } from '@/components/semantic-ui';
import { IconBolt, IconPlay, IconRefresh, IconTrash } from '@/components/icons';

const STATUS_STYLE: Record<AutopilotStatus, string> = {
  queued: 'bg-surface-3 text-ink-3',
  running: 'bg-info/15 text-info',
  done: 'bg-ok/15 text-ok',
  failed: 'bg-bad/15 text-bad',
};

export function AutopilotWorkspace({ initialQueue, cronEnabled }: { initialQueue: AutopilotItem[]; cronEnabled: boolean }) {
  const [queue, setQueue] = useState(initialQueue);
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('English');
  const [seoMode, setSeoMode] = useState<SeoMode>('full-seo');
  const [targetWords, setTargetWords] = useState(1800);
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState<'one' | 'all' | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const latest = useRef(queue);
  latest.current = queue;

  const counts = {
    queued: queue.filter((i) => i.status === 'queued').length,
    done: queue.filter((i) => i.status === 'done').length,
    failed: queue.filter((i) => i.status === 'failed').length,
  };

  async function refresh() {
    const data = await fetch('/api/autopilot').then(readJson).catch(() => null);
    if (data?.queue) {
      latest.current = data.queue;
      setQueue(data.queue);
    }
  }

  async function add() {
    const keywords = text.split(/\n|,/).map((k) => k.trim()).filter(Boolean);
    if (!keywords.length) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, language, seoMode, targetWords, includeFaq: true }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error ?? 'Could not queue keywords.');
      setQueue(data.queue);
      setText('');
      if (data.added.length < keywords.length) {
        setError(`${keywords.length - data.added.length} keyword(s) skipped: duplicates, already queued, or shorter than 3 characters.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not queue keywords.');
    } finally {
      setAdding(false);
    }
  }

  /** One tick. Returns how many are still queued, or -1 on failure. */
  async function tick(): Promise<number> {
    const next = [...latest.current].reverse().find((i) => i.status === 'queued');
    setCurrent(next?.keyword ?? null);
    const res = await fetch('/api/autopilot/run', { method: 'POST' });
    const data = await readJson(res);
    await refresh();
    if (!res.ok) {
      setError(data.error ?? `Autopilot tick failed (HTTP ${res.status}).`);
      return -1;
    }
    return data.item ? data.remaining : 0;
  }

  async function runOne() {
    setRunning('one');
    setError(null);
    await tick();
    setRunning(null);
    setCurrent(null);
  }

  async function runAll() {
    setRunning('all');
    setError(null);
    stop.current = false;
    for (;;) {
      const remaining = await tick();
      if (remaining <= 0 || stop.current) break;
    }
    setRunning(null);
    setCurrent(null);
  }

  async function act(id: string, method: 'POST' | 'DELETE') {
    await fetch(`/api/autopilot/${id}`, { method });
    await refresh();
  }

  async function clearFinished() {
    const data = await fetch('/api/autopilot', { method: 'DELETE' }).then(readJson);
    setQueue(data.queue);
  }

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Queued" value={counts.queued} />
        <StatTile label="Written" value={counts.done} tone="ok" />
        <StatTile label="Failed" value={counts.failed} tone={counts.failed ? 'bad' : undefined} />
      </div>

      <Panel icon={<IconBolt />} title="Add keywords" subtitle="One per line or comma separated. Up to 50 at a time.">
        <textarea
          className="field mb-3 min-h-[120px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'best trail running shoes 2026\nhow to size a heat pump\nsolar battery cost uk'}
          aria-label="Keywords"
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto]">
          <input className="field" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language" />
          <select className="field" value={seoMode} onChange={(e) => setSeoMode(e.target.value as SeoMode)} aria-label="SEO mode">
            {Object.entries(SEO_MODES).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
          </select>
          <input className="field" type="number" min={300} max={6000} step={100} value={targetWords}
                 onChange={(e) => setTargetWords(Number(e.target.value))} aria-label="Target words" />
          <button className="btn-primary" disabled={adding || !text.trim()} onClick={add}>
            {adding ? <><Spinner /> Adding…</> : 'Add to queue'}
          </button>
        </div>
      </Panel>

      <Panel
        icon={<IconPlay />}
        title="Queue"
        subtitle={cronEnabled
          ? 'The scheduled run also writes one item a day. Run more now with the buttons.'
          : 'Each article takes one to three minutes. Keep this tab open while "Run all" works through the queue.'}
        action={
          <div className="flex flex-wrap gap-2">
            {running === 'all' ? (
              <button className="btn-ghost" onClick={() => { stop.current = true; }}>Stop after this one</button>
            ) : (
              <>
                <button className="btn-ghost" disabled={Boolean(running) || !counts.queued} onClick={runOne}>Run next</button>
                <button className="btn-primary" disabled={Boolean(running) || !counts.queued} onClick={runAll}>Run all</button>
              </>
            )}
            {(counts.done > 0 || counts.failed > 0) && !running && (
              <button className="btn-ghost" onClick={clearFinished}>Clear finished</button>
            )}
          </div>
        }
      >
        {running && current && <Notice tone="info"><Spinner className="mr-1 inline h-3.5 w-3.5" /> Writing “{current}”. Researching, outlining, drafting and fact checking.</Notice>}
        {error && <Notice tone="warn">{error}</Notice>}

        {queue.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">The queue is empty. Add keywords above, or send them from Keyword Research.</p>
        ) : (
          <ul className="divide-y divide-line">
            {queue.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[item.status]}`}>{item.status}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.keyword}</span>
                  <span className="block text-xs text-ink-3">
                    {SEO_MODES[item.settings.seoMode]?.label} · {item.settings.targetWords} words · {item.settings.language}
                    {item.error && <span className="text-bad"> · {item.error}</span>}
                  </span>
                </span>
                {item.articleId && (
                  <Link href={`/articles/${item.articleId}`} className="btn-ghost px-3 py-1.5 text-xs">Open article</Link>
                )}
                {item.status === 'failed' && (
                  <button className="rounded-lg p-1.5 text-ink-3 hover:text-accent" onClick={() => void act(item.id, 'POST')} aria-label="Retry">
                    <IconRefresh className="h-4 w-4" />
                  </button>
                )}
                {item.status !== 'running' && (
                  <button className="rounded-lg p-1.5 text-ink-3 hover:text-bad" onClick={() => void act(item.id, 'DELETE')} aria-label={`Remove ${item.keyword}`}>
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
