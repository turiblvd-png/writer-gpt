'use client';

import { useState } from 'react';
import { EDITABLE_SECTIONS, arrangeNav, type NavItem } from '@/lib/nav';
import type { NavSettings } from '@/lib/platform/settings';
import { Icon } from '@/components/shell';
import { SortableList } from '@/components/sortable';
import { Notice, Spinner } from '@/components/semantic-ui';
import { IconEye } from '@/components/icons';

export function NavigationWorkspace({ initial }: { initial: NavSettings }) {
  // Start from the menu as admins see it now, so saved orders show up.
  const arranged = arrangeNav(initial, true, EDITABLE_SECTIONS);
  const [order, setOrder] = useState<Record<string, NavItem[]>>(() => Object.fromEntries(arranged.map((s) => [s.id, s.items])));
  const [hidden, setHidden] = useState<string[]>(initial.hidden);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const nav: NavSettings = { order: Object.fromEntries(Object.entries(order).map(([k, items]) => [k, items.map((i) => i.href)])), hidden };
    const res = await fetch('/api/admin/platform', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nav }) });
    setSaving(false);
    if (res.ok) {
      setMsg({ tone: 'ok', text: 'Menu saved. Reloading so you see it…' });
      setTimeout(() => window.location.reload(), 600);
    } else {
      setMsg({ tone: 'bad', text: (await res.json().catch(() => ({}))).error ?? 'Could not save.' });
    }
  }

  function reset() {
    setOrder(Object.fromEntries(EDITABLE_SECTIONS.map((s) => [s.id, s.items])));
    setHidden([]);
  }

  return (
    <>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        {arranged.map((section) => (
          <section key={section.id} className="card min-w-0 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-bold"><Icon name={section.icon} className="h-4 w-4 text-accent" /> {section.label}</h3>
            <SortableList
              items={order[section.id] ?? []}
              getKey={(i) => i.href}
              onChange={(next) => setOrder((o) => ({ ...o, [section.id]: next }))}
              render={(item) => {
                const off = hidden.includes(item.href);
                return (
                  <div className={`flex items-center gap-3 ${off ? 'opacity-50' : ''}`}>
                    <Icon name={item.icon} className="h-4 w-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => setHidden((h) => (off ? h.filter((x) => x !== item.href) : [...h, item.href]))}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${off ? 'bg-surface-3 text-ink-3' : 'bg-ok/15 text-ok'}`}
                      aria-label={`${off ? 'Show' : 'Hide'} ${item.label}`}
                    >
                      <IconEye className="h-3.5 w-3.5" /> {off ? 'Hidden' : 'Shown'}
                    </button>
                  </div>
                );
              }}
            />
          </section>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" disabled={saving} onClick={() => void save()}>{saving ? <><Spinner /> Saving…</> : 'Save menu'}</button>
        <button className="btn-ghost" onClick={reset}>Reset to default</button>
      </div>
    </>
  );
}
