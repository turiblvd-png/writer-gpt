'use client';

import { useState } from 'react';
import { IconDrag } from './icons';

/**
 * A vertical list you can reorder by dragging, or with the arrow buttons on
 * touch screens, where HTML drag and drop does not fire.
 */
export function SortableList<T>({
  items,
  getKey,
  onChange,
  render,
}: {
  items: T[];
  getKey: (item: T) => string;
  onChange: (next: T[]) => void;
  render: (item: T, index: number) => React.ReactNode;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  }

  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={getKey(item)}
          draggable
          onDragStart={(e) => {
            setDragging(i);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(i);
          }}
          onDragLeave={() => setOver((o) => (o === i ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null) move(dragging, i);
            setDragging(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          className={`flex min-w-0 items-center gap-3 rounded-xl border bg-surface-2 px-3 py-2.5 transition-colors ${
            over === i && dragging !== i ? 'border-accent' : 'border-line'
          } ${dragging === i ? 'opacity-50' : ''}`}
        >
          <span className="cursor-grab text-ink-3 active:cursor-grabbing" aria-hidden="true">
            <IconDrag className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">{render(item, i)}</div>
          <span className="flex shrink-0 flex-col">
            <button type="button" className="px-1 text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === 0}
                    onClick={() => move(i, i - 1)} aria-label="Move up">▲</button>
            <button type="button" className="px-1 text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === items.length - 1}
                    onClick={() => move(i, i + 1)} aria-label="Move down">▼</button>
          </span>
        </li>
      ))}
    </ul>
  );
}
