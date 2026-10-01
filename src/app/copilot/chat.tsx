'use client';

import { readJson } from '@/lib/http/read-json';
import { useEffect, useRef, useState } from 'react';
import type { CopilotConversation, CopilotMessage } from '@/lib/copilot/chat';
import { renderMarkdown } from '@/lib/content/render';
import { Notice, Spinner } from '@/components/semantic-ui';
import { IconChat, IconTrash } from '@/components/icons';

export function CopilotChat({
  initialConversations,
  starters,
}: {
  initialConversations: CopilotConversation[];
  starters: string[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [active, setActive] = useState<CopilotConversation | null>(initialConversations[0] ?? null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [active?.messages.length, pending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setPending(message);
    setDraft('');
    setError(null);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: active?.id, message }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error ?? `The copilot failed (HTTP ${res.status}).`);
      const conv: CopilotConversation = data.conversation;
      setActive(conv);
      setConversations((list) => [conv, ...list.filter((c) => c.id !== conv.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The copilot failed.');
      setDraft(message);
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/copilot/${id}`, { method: 'DELETE' });
    setConversations((list) => list.filter((c) => c.id !== id));
    if (active?.id === id) setActive(null);
  }

  const messages: CopilotMessage[] = active?.messages ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="card h-fit p-3">
        <button className="btn-primary mb-3 w-full" onClick={() => { setActive(null); setError(null); }}>
          New chat
        </button>
        {conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs text-ink-3">Your conversations appear here.</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <button
                  onClick={() => setActive(c)}
                  className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    active?.id === c.id ? 'bg-accent/15 text-ink' : 'text-ink-2 hover:bg-surface-2'
                  }`}
                >
                  {c.title}
                </button>
                <button
                  onClick={() => void remove(c.id)}
                  className="rounded-lg p-1.5 text-ink-3 opacity-0 hover:text-bad group-hover:opacity-100"
                  aria-label={`Delete ${c.title}`}
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="card flex min-h-[60vh] flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {messages.length === 0 && !pending && (
            <div className="py-6 text-center">
              <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent">
                <IconChat className="h-6 w-6" />
              </span>
              <h3 className="mb-1 font-bold">What are you trying to rank for?</h3>
              <p className="mb-5 text-sm text-ink-3">Pick a starter or ask your own question.</p>
              <div className="mx-auto grid max-w-2xl gap-2 sm:grid-cols-2">
                {starters.map((s) => (
                  <button key={s} onClick={() => void send(s)}
                          className="rounded-xl border border-line bg-surface-2 p-3 text-left text-sm text-ink-2 transition-colors hover:border-accent/50 hover:text-ink">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => <Bubble key={`${m.createdAt}-${i}`} message={m} />)}

          {pending && (
            <>
              <Bubble message={{ role: 'user', content: pending, createdAt: 0 }} />
              <div className="flex items-center gap-2 text-sm text-ink-3"><Spinner /> Searching and thinking…</div>
            </>
          )}
          <div ref={bottom} />
        </div>

        {error && <div className="px-5"><Notice tone="bad">{error}</Notice></div>}

        <form
          className="flex items-end gap-2 border-t border-line p-4"
          onSubmit={(e) => { e.preventDefault(); void send(draft); }}
        >
          <textarea
            className="field min-h-[48px] flex-1 resize-none"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); }
            }}
            placeholder="Ask about a keyword, a competitor, a page or a ranking drop…"
            aria-label="Message"
          />
          <button className="btn-primary" disabled={!draft.trim() || Boolean(pending)}>Send</button>
        </form>
      </section>
    </div>
  );
}

function Bubble({ message }: { message: CopilotMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-ink">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-full">
      <div className="prose-article max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
      {message.sources && message.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {message.sources.map((s) => (
            <a key={s.uri} href={s.uri} target="_blank" rel="noreferrer noopener"
               className="rounded-md bg-surface-2 px-2 py-1 text-[11px] text-ink-3 hover:text-accent">
              {s.domain || s.title || 'source'}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
