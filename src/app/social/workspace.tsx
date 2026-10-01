'use client';

import { readJson } from '@/lib/http/read-json';
import { useState } from 'react';
import type { SocialPost, SocialSet } from '@/lib/social/posts';
import { PLATFORMS, type Platform } from '@/lib/social/platforms';
import { Notice, Panel, Spinner } from '@/components/semantic-ui';
import { IconCheck, IconCopy, IconShare, IconTrash } from '@/components/icons';

export function SocialWorkspace({
  articles,
  initialSets,
  initialArticleId,
}: {
  articles: { id: string; title: string }[];
  initialSets: SocialSet[];
  initialArticleId?: string;
}) {
  const [source, setSource] = useState<'article' | 'paste'>(articles.length ? 'article' : 'paste');
  const [articleId, setArticleId] = useState(initialArticleId ?? articles[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [tone, setTone] = useState('confident and helpful');
  const [platforms, setPlatforms] = useState<Platform[]>(['linkedin', 'x', 'facebook', 'instagram']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sets, setSets] = useState(initialSets);
  const [current, setCurrent] = useState<SocialSet | null>(initialSets[0] ?? null);

  function toggle(p: Platform) {
    setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          source === 'article' ? { articleId, url, tone, platforms } : { title, text, url, tone, platforms },
        ),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error ?? 'Could not write posts.');
      setCurrent(data.set);
      setSets((s) => [data.set, ...s]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write posts.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/social/${id}`, { method: 'DELETE' });
    setSets((s) => s.filter((x) => x.id !== id));
    if (current?.id === id) setCurrent(null);
  }

  const ready = platforms.length > 0 && (source === 'article' ? Boolean(articleId) : text.trim().length >= 200);

  return (
    <>
      <Panel icon={<IconShare />} title="Source">
        <div className="mb-4 inline-flex rounded-xl bg-surface-2 p-1">
          {(['article', 'paste'] as const).map((s) => (
            <button key={s} onClick={() => setSource(s)}
                    className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${source === s ? 'bg-accent text-accent-ink' : 'text-ink-3 hover:text-ink'}`}>
              {s === 'article' ? 'From My Articles' : 'Paste text'}
            </button>
          ))}
        </div>

        {source === 'article' ? (
          articles.length ? (
            <select className="field mb-3" value={articleId} onChange={(e) => setArticleId(e.target.value)} aria-label="Article">
              {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          ) : (
            <Notice tone="info">No saved articles yet. Generate one first, or paste text instead.</Notice>
          )
        ) : (
          <>
            <input className="field mb-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title" aria-label="Title" />
            <textarea className="field mb-3 min-h-[160px]" value={text} onChange={(e) => setText(e.target.value)}
                      placeholder="Paste the article (at least a few paragraphs)" aria-label="Article text" />
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link to the published article (optional)" aria-label="Link" />
          <input className="field" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Tone" aria-label="Tone" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(Object.keys(PLATFORMS) as Platform[]).map((p) => (
            <button key={p} onClick={() => toggle(p)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      platforms.includes(p) ? 'border-accent bg-accent/15 text-ink' : 'border-line text-ink-3 hover:text-ink'
                    }`}>
              {PLATFORMS[p].label}
            </button>
          ))}
          <button className="btn-primary ml-auto" disabled={busy || !ready} onClick={run}>
            {busy ? <><Spinner /> Writing…</> : 'Write posts'}
          </button>
        </div>
        {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
      </Panel>

      {current && (
        <>
          <h3 className="mb-3 text-lg font-bold">{current.title || 'Posts'}</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {current.posts.map((post) => <PostCard key={post.platform} post={post} />)}
          </div>
        </>
      )}

      {sets.length > 1 && (
        <section className="mt-6">
          <h4 className="mb-2 text-sm font-bold text-ink-2">Earlier sets</h4>
          <ul className="card divide-y divide-line">
            {sets.map((s) => (
              <li key={s.id} className="flex items-center gap-3 p-3">
                <button className="min-w-0 flex-1 truncate text-left text-sm hover:text-accent" onClick={() => setCurrent(s)}>
                  {s.title || 'Untitled'} <span className="text-ink-3">· {s.posts.map((p) => PLATFORMS[p.platform].label).join(', ')}</span>
                </button>
                <span className="text-xs text-ink-3">{new Date(s.createdAt).toLocaleDateString()}</span>
                <button className="rounded-lg p-1.5 text-ink-3 hover:text-bad" onClick={() => void remove(s.id)} aria-label="Delete set">
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

function PostCard({ post }: { post: SocialPost }) {
  const [copied, setCopied] = useState(false);
  const meta = PLATFORMS[post.platform];
  const tags = post.hashtags.map((h) => `#${h}`).join(' ');
  const full = post.parts.map((p, i) => (i === post.parts.length - 1 && tags ? `${p}\n\n${tags}` : p)).join('\n\n');

  return (
    <section className="card p-5">
      <header className="mb-3 flex items-center gap-2">
        <h4 className="flex-1 font-bold">{meta.label}</h4>
        <button className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() => void navigator.clipboard?.writeText(full).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
          {copied ? <><IconCheck className="h-3.5 w-3.5" /> Copied</> : <><IconCopy className="h-3.5 w-3.5" /> Copy</>}
        </button>
      </header>
      <div className="space-y-3">
        {post.parts.map((part, i) => (
          <div key={i} className="rounded-xl bg-surface-2 p-3">
            <p className="whitespace-pre-wrap text-sm text-ink-2">{part}</p>
            {i === post.parts.length - 1 && tags && <p className="mt-2 text-sm text-accent">{tags}</p>}
            <p className={`mt-2 text-right font-mono text-[11px] ${post.lengths[i]! > meta.limit ? 'text-bad' : 'text-ink-3'}`}>
              {post.lengths[i]} / {meta.limit}
            </p>
          </div>
        ))}
      </div>
      {post.overLimit && <div className="mt-3"><Notice tone="warn">Over the {meta.label} limit. Trim before posting.</Notice></div>}
      {post.tells.length > 0 && (
        <div className="mt-3"><Notice tone="warn">Reads machine-written: {post.tells.join(', ')}. Edit these out.</Notice></div>
      )}
    </section>
  );
}
