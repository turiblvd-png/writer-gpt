import Link from 'next/link';
import { Shell, PageHeader } from '@/components/shell';
import { IconCheck, IconClock } from '@/components/icons';
import { SEMANTIC_WRITER_READY } from '@/lib/pipelines/semantic-writer';

export const metadata = { title: 'Semantic Writer — Writer-GPT' };

const BUILT = [
  'Step engine — sequential execution, state threading, cancellation, resume-safe failure',
  'Provider routing — per-step model roles across Gemini, DeepSeek and Grok',
  'Grounded research with citations, and a fact-check pass that flags unsupported claims',
  'SEO scoring — Yoast-style assessments, readability, density, freshness detection',
  'Live progress streaming, persistence, and the article library',
];

export default function SemanticPage() {
  return (
    <Shell>
      <PageHeader
        title="Semantic Writer"
        subtitle="The 14-step entity-first pipeline. Everything around the steps is built and tested."
      />

      <div className="mx-auto max-w-2xl space-y-5">
        {!SEMANTIC_WRITER_READY && (
          <div className="card border-accent/30 bg-accent/5 p-6">
            <p className="mb-2 flex items-center gap-2 font-bold text-accent">
              <IconClock className="h-4 w-4" /> Awaiting your 14 steps
            </p>
            <p className="text-sm text-ink-2">
              Paste the step list and they drop into{' '}
              <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-accent-2">
                src/lib/pipelines/semantic-writer.ts
              </code>
              . The file documents the step contract and carries a worked example.
            </p>
          </div>
        )}

        <div className="card p-6">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-3">Already in place</h3>
          <ul className="space-y-2.5">
            {BUILT.map((item) => (
              <li key={item} className="flex gap-3 text-sm text-ink-2">
                <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-center text-sm text-ink-3">
          In the meantime,{' '}
          <Link href="/generate" className="text-accent underline underline-offset-2">Generate Content</Link>{' '}
          runs the same engine over six steps.
        </p>
      </div>
    </Shell>
  );
}
