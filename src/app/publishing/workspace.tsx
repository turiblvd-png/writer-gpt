'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { WpConfigView } from '@/lib/publishing/wordpress';
import { Notice, Panel, Spinner } from '@/components/semantic-ui';
import { IconCheck, IconGlobe, IconUpload } from '@/components/icons';

interface ArticleRow {
  id: string;
  title: string;
  wordCount: number;
  status: string;
  publishedUrl: string | null;
  wpPostId: number | null;
  createdAt: number;
}

export function PublishingWorkspace({ initialConfig, articles: initialArticles }: { initialConfig: WpConfigView; articles: ArticleRow[] }) {
  const [config, setConfig] = useState(initialConfig);
  const [articles, setArticles] = useState(initialArticles);
  const [form, setForm] = useState({ siteUrl: initialConfig.siteUrl, username: initialConfig.username, appPassword: '' });
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState<Record<string, string>>({});

  async function connect() {
    setConnecting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/publishing/wordpress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not connect.');
      setConfig(data.wordpress);
      setForm((f) => ({ ...f, appPassword: '' }));
      setMessage({ tone: 'ok', text: `Connected as ${data.name}.` });
    } catch (err) {
      setMessage({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not connect.' });
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    const data = await fetch('/api/publishing/wordpress', { method: 'DELETE' }).then((r) => r.json());
    setConfig(data.wordpress);
    setMessage(null);
  }

  async function publish(id: string, status: 'draft' | 'publish' | 'future') {
    setBusyId(id);
    setRowError((e) => ({ ...e, [id]: '' }));
    try {
      const date = schedule[id];
      const res = await fetch('/api/publishing/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: id, status, date: status === 'future' && date ? new Date(date).toISOString() : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Publishing failed.');
      setArticles((list) => list.map((a) => (a.id === id
        ? { ...a, status: data.article.status, publishedUrl: data.link, wpPostId: data.postId }
        : a)));
    } catch (err) {
      setRowError((e) => ({ ...e, [id]: err instanceof Error ? err.message : 'Publishing failed.' }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Panel
        icon={<IconGlobe />}
        title={config.connected ? 'Connected' : 'Connect WordPress'}
        subtitle={config.connected
          ? `${config.siteUrl} as ${config.username}${config.source === 'env' ? ' (set by environment variables)' : ''}`
          : 'Uses a WordPress Application Password. Your normal login password will not work.'}
        action={config.connected && config.source === 'saved'
          ? <button className="btn-ghost" onClick={disconnect}>Disconnect</button>
          : undefined}
      >
        {config.source !== 'env' && (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <input className="field" value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} placeholder="https://yoursite.com" aria-label="Site address" />
              <input className="field" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="WordPress username" aria-label="Username" autoComplete="off" />
              <input className="field" type="password" value={form.appPassword} onChange={(e) => setForm({ ...form, appPassword: e.target.value })} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" aria-label="Application Password" autoComplete="new-password" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn-primary" disabled={connecting || !form.siteUrl || !form.username || !form.appPassword} onClick={connect}>
                {connecting ? <><Spinner /> Testing…</> : config.connected ? 'Update connection' : 'Test and connect'}
              </button>
              <details className="text-xs text-ink-3">
                <summary className="cursor-pointer hover:text-ink">How do I get an Application Password?</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Log in to your WordPress dashboard.</li>
                  <li>Go to Users, then Profile.</li>
                  <li>Scroll to Application Passwords, type “Writer-GPT” and click Add New.</li>
                  <li>Copy the password it shows (spaces are fine) and paste it here.</li>
                </ol>
              </details>
            </div>
          </>
        )}
        {message && <div className="mt-3"><Notice tone={message.tone}>{message.text}</Notice></div>}
      </Panel>

      <Panel icon={<IconUpload />} title="Articles" subtitle={config.connected ? 'Send any article to your site.' : 'Connect your site to enable publishing.'}>
        {articles.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-3">No articles yet. <Link href="/generate" className="text-accent underline">Generate one</Link>.</p>
        ) : (
          <ul className="divide-y divide-line">
            {articles.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <Link href={`/articles/${a.id}`} className="block truncate text-sm font-medium hover:text-accent">{a.title}</Link>
                    <span className="block text-xs text-ink-3">
                      {a.wordCount.toLocaleString()} words
                      {a.publishedUrl && <> · <a href={a.publishedUrl} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">view on site</a></>}
                    </span>
                  </span>
                  {a.status === 'published' && <span className="inline-flex items-center gap-1 rounded-md bg-ok/15 px-2 py-0.5 text-[10px] font-bold uppercase text-ok"><IconCheck className="h-3 w-3" /> Live</span>}
                  {a.wpPostId && a.status !== 'published' && <span className="rounded-md bg-info/15 px-2 py-0.5 text-[10px] font-bold uppercase text-info">In WordPress</span>}
                  {busyId === a.id ? <Spinner /> : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button className="btn-ghost px-3 py-1.5 text-xs" disabled={!config.connected || Boolean(busyId)} onClick={() => void publish(a.id, 'draft')}>
                        {a.wpPostId ? 'Update as draft' : 'Send as draft'}
                      </button>
                      <button className="btn-primary px-3 py-1.5 text-xs" disabled={!config.connected || Boolean(busyId)} onClick={() => void publish(a.id, 'publish')}>
                        {a.status === 'published' ? 'Update live post' : 'Publish now'}
                      </button>
                      <input type="datetime-local" className="field w-auto px-2 py-1 text-xs" value={schedule[a.id] ?? ''}
                             onChange={(e) => setSchedule((s) => ({ ...s, [a.id]: e.target.value }))} aria-label={`Schedule ${a.title}`} />
                      <button className="btn-ghost px-3 py-1.5 text-xs" disabled={!config.connected || !schedule[a.id] || Boolean(busyId)} onClick={() => void publish(a.id, 'future')}>
                        Schedule
                      </button>
                    </div>
                  )}
                </div>
                {rowError[a.id] && <div className="mt-2"><Notice tone="bad">{rowError[a.id]}</Notice></div>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
