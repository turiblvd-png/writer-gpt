import Link from 'next/link';
import { Shell } from '@/components/shell';
import { listProjects } from '@/lib/semantic/store';
import { STEPS } from '@/lib/semantic/steps';
import { NewProjectForm } from './new-project';
import { IconPlay } from '@/components/icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Semantic Writer — Writer-GPT' };

const FEATURES = [
  'Competitor research and analysis',
  'AI-generated outlines',
  'Entity extraction',
  'N-gram and NLP optimization',
  'Full content generation',
  `${STEPS.length}-step workflow`,
];

export default function SemanticLandingPage() {
  const projects = listProjects();

  return (
    <Shell>
      <section className="card relative mb-6 overflow-hidden border-accent/20 p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
            Writer GPT workspace
          </span>
          <h2 className="mt-4 text-4xl font-extrabold tracking-tight">Semantic Writer</h2>
          <p className="mt-2 max-w-2xl text-ink-2">
            Build evidence-led articles with competitor research, entity coverage and semantic optimization.
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-3">
            <IconPlay className="h-3.5 w-3.5" /> Watch video
          </span>

          <div className="mt-6 flex flex-wrap gap-2">
            {FEATURES.map((f) => (
              <span key={f} className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-2">
                {f}
              </span>
            ))}
            <span className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">
              Beta
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <NewProjectForm />

        <section className="card p-6">
          <h3 className="text-lg font-bold">Recent projects</h3>
          <p className="mt-1 text-sm text-ink-2">Continue working on existing projects.</p>

          {projects.length === 0 ? (
            <p className="mt-6 text-sm text-ink-3">No projects yet</p>
          ) : (
            <ul className="mt-5 space-y-2">
              {projects.map((p) => {
                const done = p.completedSteps.length;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/semantic/${p.id}`}
                      className="block rounded-xl border border-line bg-surface-2 p-4 transition-colors hover:border-accent/50"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold text-ink">{p.name}</span>
                        <span className="shrink-0 font-mono text-[11px] text-ink-3">
                          {done}/{STEPS.length}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-3">{p.mainKeyword}</p>
                      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                          style={{ width: `${(done / STEPS.length) * 100}%` }}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
