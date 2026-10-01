'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconPlus } from '@/components/icons';
import { Spinner } from '@/components/semantic-ui';

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Arabic', 'Hindi', 'Urdu'];

export function NewProjectForm({ initialKeyword = '' }: { initialKeyword?: string }) {
  const router = useRouter();
  const [language, setLanguage] = useState('English');
  const [name, setName] = useState('');
  const [mainKeyword, setMainKeyword] = useState(initialKeyword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/semantic/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || mainKeyword.trim(), mainKeyword, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not create the project.');

      // Confirm the project is readable before navigating. On a host that does
      // not share storage between instances the write can succeed while the
      // next request sees nothing, and landing on an empty page is far more
      // confusing than being told what happened.
      const check = await fetch(`/api/semantic/projects/${data.project.id}`, { cache: 'no-store' });
      if (!check.ok) {
        throw new Error(
          'The project was created but could not be read back. This host does not share saved data between ' +
          'server instances, so projects cannot be reopened. Deploy to a host with a persistent disk to fix this.',
        );
      }

      router.push(`/semantic/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project.');
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h3 className="text-lg font-bold">New project</h3>
      <p className="mt-1 text-sm text-ink-2">Start a new semantic content project.</p>

      <label className="label mt-5" htmlFor="language">Content language</label>
      <select id="language" className="field" value={language} onChange={(e) => setLanguage(e.target.value)}>
        {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
      </select>
      <p className="mt-1.5 text-xs text-ink-3">
        Research, entities, N-grams, keywords, outlines, headlines, and the final article will use this language.
      </p>

      <label className="label mt-5" htmlFor="name">Project name</label>
      <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="My SEO article" />

      <label className="label mt-5" htmlFor="kw">Main keyword</label>
      <input
        id="kw" className="field" value={mainKeyword}
        onChange={(e) => setMainKeyword(e.target.value)}
        placeholder="e.g. best project management software"
        onKeyDown={(e) => { if (e.key === 'Enter' && mainKeyword.trim().length >= 2) void create(); }}
      />

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      <button
        className="btn-primary mt-5 w-full py-3"
        disabled={busy || mainKeyword.trim().length < 2}
        onClick={create}
      >
        {busy ? <><Spinner /> Creating…</> : <><IconPlus className="h-4 w-4" /> Create project</>}
      </button>
    </section>
  );
}
