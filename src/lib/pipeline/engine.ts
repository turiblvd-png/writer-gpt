import type { Source, TokenUsage } from '@/lib/ai';
import type {
  Pipeline,
  RunClock,
  RunEvent,
  RunSnapshot,
  StepContext,
  StepRecord,
} from './types';

export interface RunOptions<S> {
  runId: string;
  pipeline: Pipeline<S>;
  initialState: S;
  signal?: AbortSignal;
  now?: Date;
  /** Called after every state change so callers can persist or stream. */
  onEvent?: (event: RunEvent<S>) => void | Promise<void>;
}

export function makeClock(now: Date = new Date()): RunClock {
  return {
    now,
    today: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    year: now.getFullYear(),
  };
}

/**
 * Executes a pipeline step by step, merging each step's patch into run state and
 * emitting a snapshot after every transition.
 *
 * Steps run sequentially and share accumulated state, because later steps depend
 * on earlier ones (you cannot outline before you know search intent). A failed
 * step aborts the run but the snapshot keeps every completed step's output, so
 * a retry can resume rather than restart.
 */
export async function runPipeline<S>(opts: RunOptions<S>): Promise<RunSnapshot<S>> {
  const { runId, pipeline, initialState, onEvent } = opts;
  const clock = makeClock(opts.now);
  const controller = new AbortController();
  const signal = opts.signal ?? controller.signal;

  let state = { ...initialState };
  const sources: Source[] = [];
  const usage: TokenUsage = { input: 0, output: 0, total: 0 };

  const steps: StepRecord[] = pipeline.steps.map((s) => ({
    id: s.id,
    title: s.title,
    status: 'pending',
    logs: [],
  }));

  // Fraction of the current step that is complete, folded into overall progress
  // so a 60s step does not leave the bar frozen.
  let inFlight = 0;
  let completedCount = 0;
  const startedAt = Date.now();

  const snapshot = (
    status: RunSnapshot<S>['status'],
    currentStepId?: string,
    error?: string,
  ): RunSnapshot<S> => ({
    runId,
    pipelineId: pipeline.id,
    status,
    progress: pipeline.steps.length
      ? Math.min(1, (completedCount + inFlight) / pipeline.steps.length)
      : 1,
    currentStepId,
    steps: steps.map((s) => ({ ...s, logs: [...s.logs] })),
    sources: [...sources],
    usage: { ...usage },
    state,
    error,
    startedAt,
    endedAt: status === 'running' ? undefined : Date.now(),
  });

  const emit = async (event: RunEvent<S>) => {
    try {
      await onEvent?.(event);
    } catch {
      // A failing listener (closed SSE stream, disk error) must not kill the run.
    }
  };

  await emit({ type: 'run:start', snapshot: snapshot('running') });

  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i]!;
    const record = steps[i]!;

    if (signal.aborted) {
      record.status = 'pending';
      const snap = snapshot('cancelled', step.id, 'Run cancelled.');
      await emit({ type: 'run:error', error: 'Run cancelled.', snapshot: snap });
      return snap;
    }

    if (step.skipIf?.(state)) {
      record.status = 'skipped';
      completedCount++;
      await emit({ type: 'step:done', stepId: step.id, snapshot: snapshot('running', step.id) });
      continue;
    }

    record.status = 'running';
    record.startedAt = Date.now();
    inFlight = 0;
    await emit({ type: 'step:start', stepId: step.id, snapshot: snapshot('running', step.id) });

    const ctx: StepContext<S> = {
      state,
      clock,
      signal,
      log: (message) => {
        record.logs.push(message);
        void emit({ type: 'step:log', stepId: step.id, message });
      },
      cite: (found) => {
        for (const s of found) {
          if (!sources.some((existing) => existing.uri === s.uri)) sources.push(s);
        }
      },
      meter: (used) => {
        addUsage(usage, used);
        record.usage = record.usage
          ? {
              input: record.usage.input + used.input,
              output: record.usage.output + used.output,
              total: record.usage.total + used.total,
            }
          : { ...used };
      },
      progress: (fraction) => {
        inFlight = Math.max(0, Math.min(1, fraction));
        void emit({ type: 'step:progress', stepId: step.id, snapshot: snapshot('running', step.id) });
      },
    };

    try {
      const patch = await step.run(ctx);
      state = { ...state, ...patch };
      record.status = 'done';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      record.status = 'failed';
      record.error = message;
      record.endedAt = Date.now();
      record.durationMs = record.endedAt - (record.startedAt ?? record.endedAt);

      const cancelled = signal.aborted;
      const snap = snapshot(cancelled ? 'cancelled' : 'failed', step.id, message);
      await emit({ type: 'run:error', error: message, snapshot: snap });
      return snap;
    }

    record.endedAt = Date.now();
    record.durationMs = record.endedAt - (record.startedAt ?? record.endedAt);
    inFlight = 0;
    completedCount++;
    await emit({ type: 'step:done', stepId: step.id, snapshot: snapshot('running', step.id) });
  }

  const final = snapshot('done');
  await emit({ type: 'run:done', snapshot: final });
  return final;
}

/** Fold a step's token usage into the run total. Steps call this via helpers. */
export function addUsage(total: TokenUsage, next: TokenUsage): void {
  total.input += next.input;
  total.output += next.output;
  total.total += next.total;
}
