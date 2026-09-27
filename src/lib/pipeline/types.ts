import type { ModelRole, Source, TokenUsage } from '@/lib/ai';

export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

/**
 * Ambient facts every step receives. `now` exists because the single worst
 * failure in the sample article was temporal: it was generated 23 days before
 * the 2026 event and wrote a 2024/2025 retrospective. No step is allowed to
 * guess what "today" is.
 */
export interface RunClock {
  now: Date;
  /** e.g. "27 September 2026" — pasted verbatim into prompts. */
  today: string;
  year: number;
}

export interface StepContext<S> {
  /** Accumulated state from every prior step. Treat as read-only. */
  readonly state: Readonly<S>;
  readonly clock: RunClock;
  readonly signal: AbortSignal;
  /** Append a human-readable line to the run log, surfaced in the UI. */
  log(message: string): void;
  /** Record sources this step grounded on, merged into the run's citation set. */
  cite(sources: Source[]): void;
  /** Report token usage so the run and step totals stay accurate. */
  meter(used: TokenUsage): void;
  /** Report sub-step progress (0–1) for long steps. */
  progress(fraction: number): void;
}

/**
 * One unit of work. Steps return a patch that is merged into run state, which
 * keeps them independently testable: given state in, assert patch out.
 */
export interface PipelineStep<S> {
  id: string;
  title: string;
  description?: string;
  /** Which model tier this step needs. Omit for steps that call no model. */
  role?: ModelRole;
  /** Skip conditionally, e.g. an FAQ step when the user disabled FAQs. */
  skipIf?: (state: Readonly<S>) => boolean;
  run(ctx: StepContext<S>): Promise<Partial<S>>;
}

export interface StepRecord {
  id: string;
  title: string;
  status: StepStatus;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  usage?: TokenUsage;
  logs: string[];
  error?: string;
}

export interface RunSnapshot<S> {
  runId: string;
  pipelineId: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  /** 0–1 across the whole pipeline, including in-flight sub-step progress. */
  progress: number;
  currentStepId?: string;
  steps: StepRecord[];
  sources: Source[];
  usage: TokenUsage;
  state: S;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

export type RunEvent<S> =
  | { type: 'run:start'; snapshot: RunSnapshot<S> }
  | { type: 'step:start'; stepId: string; snapshot: RunSnapshot<S> }
  | { type: 'step:progress'; stepId: string; snapshot: RunSnapshot<S> }
  | { type: 'step:log'; stepId: string; message: string }
  | { type: 'step:done'; stepId: string; snapshot: RunSnapshot<S> }
  | { type: 'run:done'; snapshot: RunSnapshot<S> }
  | { type: 'run:error'; error: string; snapshot: RunSnapshot<S> };

export interface Pipeline<S> {
  id: string;
  title: string;
  steps: PipelineStep<S>[];
}
