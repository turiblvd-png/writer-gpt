'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { STEPS } from '@/lib/semantic/steps';
import type { ProjectData, SemanticProject } from '@/lib/semantic/types';
import { IconCheck, IconChevron } from '@/components/icons';
import { StepInfo } from '@/components/semantic-ui';
import { StagePanel } from './stages';

export interface StageApi {
  project: SemanticProject;
  /** Persist a patch to project data. Optimistic: local state updates first. */
  patch: (data: Partial<ProjectData>) => Promise<void>;
  /** Run a server action for this stage. Returns false if it failed. */
  runAction: (action: string, body?: Record<string, unknown>) => Promise<boolean>;
  busy: string | null;
  error: string | null;
  clearError: () => void;
}

export function Workspace({ initial }: { initial: SemanticProject }) {
  const [project, setProject] = useState(initial);
  const [stepIdx, setStepIdx] = useState(Math.min(initial.currentStepIndex, STEPS.length - 1));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIdx]!;

  const patch = useCallback(async (data: Partial<ProjectData>) => {
    // Apply locally first so typing and toggling never wait on the network.
    setProject((p) => ({ ...p, data: { ...p.data, ...data } }));
    try {
      const res = await fetch(`/api/semantic/projects/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save.');
      const { project: saved } = await res.json();
      // Adopt the server copy so a concurrent action's result is not lost.
      setProject(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }, [initial.id]);

  const runAction = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/semantic/projects/${initial.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Action failed.');
      setProject(data.project);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
      return false;
    } finally {
      setBusy(null);
    }
  }, [initial.id]);

  const api = useMemo<StageApi>(
    () => ({ project, patch, runAction, busy, error, clearError: () => setError(null) }),
    [project, patch, runAction, busy, error],
  );

  const goto = useCallback(async (index: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, index));
    const current = STEPS[stepIdx]!;

    // Mark the stage we are leaving as complete if it now satisfies its own test.
    const completed = current.isComplete(project.data) && !project.completedSteps.includes(current.id)
      ? [...project.completedSteps, current.id]
      : project.completedSteps;

    setStepIdx(next);
    setError(null);
    setProject((p) => ({ ...p, currentStepIndex: next, completedSteps: completed }));
    window.scrollTo({ top: 0, behavior: 'smooth' });

    void fetch(`/api/semantic/projects/${initial.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentStepIndex: next, completedSteps: completed }),
    });
  }, [initial.id, project.data, project.completedSteps, stepIdx]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link href="/semantic" className="text-sm text-ink-3 hover:text-accent">← Semantic Writer</Link>
          <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight">{project.name}</h2>
        </div>
        <p className="font-mono text-xs text-ink-3">
          Step {stepIdx + 1} of {STEPS.length} · {project.mainKeyword}
        </p>
      </div>

      <Stepper
        current={stepIdx}
        completed={project.completedSteps}
        data={project.data}
        onSelect={goto}
      />

      <StepInfo title={step.title} whatIsThis={step.whatIsThis} seoImpact={step.seoImpact} />

      <StagePanel stepId={step.id} api={api} onNavigate={goto} />

      <nav className="mt-6 flex items-center justify-between gap-3">
        <button className="btn-ghost" onClick={() => goto(stepIdx - 1)} disabled={stepIdx === 0}>
          <IconChevron className="h-4 w-4 rotate-180" /> Previous
        </button>
        <button className="btn-primary" onClick={() => goto(stepIdx + 1)} disabled={stepIdx === STEPS.length - 1}>
          Next <IconChevron className="h-4 w-4" />
        </button>
      </nav>
    </>
  );
}

function Stepper({
  current, completed, data, onSelect,
}: {
  current: number;
  completed: string[];
  data: ProjectData;
  onSelect: (i: number) => void;
}) {
  const doneCount = STEPS.filter((s) => completed.includes(s.id) || s.isComplete(data)).length;

  return (
    <div className="mb-5">
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const isDone = completed.includes(s.id) || s.isComplete(data);
          const isCurrent = i === current;
          return (
            <div key={s.id} className="flex shrink-0 items-center">
              <button
                onClick={() => onSelect(i)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  isCurrent
                    ? 'border-accent bg-gradient-to-r from-accent/20 to-accent-2/15 text-accent ring-1 ring-accent/40'
                    : isDone
                      ? 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/15'
                      : 'border-line bg-surface-2 text-ink-3 hover:border-line hover:text-ink-2'
                }`}
              >
                {isDone && !isCurrent
                  ? <IconCheck className="h-3.5 w-3.5" />
                  : <span className="font-mono text-[10px] opacity-70">{i + 1}</span>}
                {s.label}
              </button>
              {i < STEPS.length - 1 && <IconChevron className="h-3.5 w-3.5 shrink-0 text-ink-3/50" />}
            </div>
          );
        })}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500"
          style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
