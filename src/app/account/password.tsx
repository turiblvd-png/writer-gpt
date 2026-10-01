'use client';

import { useState } from 'react';
import { Notice } from '@/components/semantic-ui';

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/account/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current, next }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? { tone: 'ok', text: 'Password changed.' } : { tone: 'bad', text: data.error ?? 'Could not change it.' });
    if (res.ok) { setCurrent(''); setNext(''); }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <input className="field" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" aria-label="Current password" autoComplete="current-password" />
      <input className="field" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button className="btn-primary" disabled={!current || next.length < 8}>Change password</button>
    </form>
  );
}
