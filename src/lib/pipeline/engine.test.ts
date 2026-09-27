import { describe, expect, it } from 'vitest';
import { runPipeline } from './engine';
import type { Pipeline, RunEvent } from './types';

interface S {
  trail: string[];
  skipSecond?: boolean;
}

const step = (id: string, fn?: () => void): Pipeline<S>['steps'][number] => ({
  id,
  title: id,
  async run(ctx) {
    fn?.();
    return { trail: [...ctx.state.trail, id] };
  },
});

const pipe = (steps: Pipeline<S>['steps']): Pipeline<S> => ({ id: 'test', title: 'Test', steps });

describe('runPipeline', () => {
  it('runs steps in order and threads state through each patch', async () => {
    const snap = await runPipeline({
      runId: 'r1',
      pipeline: pipe([step('a'), step('b'), step('c')]),
      initialState: { trail: [] },
    });

    expect(snap.status).toBe('done');
    expect(snap.state.trail).toEqual(['a', 'b', 'c']);
    expect(snap.progress).toBe(1);
    expect(snap.steps.every((s) => s.status === 'done')).toBe(true);
  });

  it('honours skipIf without running the step', async () => {
    let ran = false;
    const skippable = { ...step('b', () => { ran = true; }), skipIf: (s: S) => Boolean(s.skipSecond) };

    const snap = await runPipeline({
      runId: 'r2',
      pipeline: pipe([step('a'), skippable, step('c')]),
      initialState: { trail: [], skipSecond: true },
    });

    expect(ran).toBe(false);
    expect(snap.state.trail).toEqual(['a', 'c']);
    expect(snap.steps[1]!.status).toBe('skipped');
    expect(snap.progress).toBe(1);
  });

  it('stops at a failing step but preserves completed work', async () => {
    const boom: Pipeline<S>['steps'][number] = {
      id: 'boom',
      title: 'boom',
      async run() {
        throw new Error('upstream exploded');
      },
    };

    const snap = await runPipeline({
      runId: 'r3',
      pipeline: pipe([step('a'), boom, step('c')]),
      initialState: { trail: [] },
    });

    expect(snap.status).toBe('failed');
    expect(snap.error).toBe('upstream exploded');
    // The work done before the failure survives, so a retry can resume.
    expect(snap.state.trail).toEqual(['a']);
    expect(snap.steps[1]!.status).toBe('failed');
    expect(snap.steps[2]!.status).toBe('pending');
  });

  it('stops before the next step when the signal aborts mid-run', async () => {
    const controller = new AbortController();
    const abortAfterFirst = step('a', () => controller.abort());

    const snap = await runPipeline({
      runId: 'r4',
      pipeline: pipe([abortAfterFirst, step('b')]),
      initialState: { trail: [] },
      signal: controller.signal,
    });

    expect(snap.status).toBe('cancelled');
    expect(snap.state.trail).toEqual(['a']);
    expect(snap.steps[1]!.status).toBe('pending');
  });

  it('accumulates sources de-duplicated by uri, and sums token usage', async () => {
    const citing = (id: string, uri: string): Pipeline<S>['steps'][number] => ({
      id,
      title: id,
      async run(ctx) {
        ctx.cite([{ uri, title: id }]);
        ctx.meter({ input: 10, output: 5, total: 15 });
        return { trail: [...ctx.state.trail, id] };
      },
    });

    const snap = await runPipeline({
      runId: 'r5',
      pipeline: pipe([citing('a', 'https://x.com/1'), citing('b', 'https://x.com/1'), citing('c', 'https://x.com/2')]),
      initialState: { trail: [] },
    });

    expect(snap.sources.map((s) => s.uri)).toEqual(['https://x.com/1', 'https://x.com/2']);
    expect(snap.usage).toEqual({ input: 30, output: 15, total: 45 });
    expect(snap.steps[0]!.usage).toEqual({ input: 10, output: 5, total: 15 });
  });

  it('reports fractional progress while a long step is in flight', async () => {
    const seen: number[] = [];
    const slow: Pipeline<S>['steps'][number] = {
      id: 'slow',
      title: 'slow',
      async run(ctx) {
        ctx.progress(0.5);
        return { trail: [...ctx.state.trail, 'slow'] };
      },
    };

    await runPipeline({
      runId: 'r6',
      pipeline: pipe([step('a'), slow]),
      initialState: { trail: [] },
      onEvent: (e: RunEvent<S>) => {
        if (e.type === 'step:progress') seen.push(e.snapshot.progress);
      },
    });

    // One of two steps done, plus half of the second.
    expect(seen).toEqual([0.75]);
  });

  it('survives a listener that throws, so a dropped stream cannot kill a run', async () => {
    const snap = await runPipeline({
      runId: 'r7',
      pipeline: pipe([step('a'), step('b')]),
      initialState: { trail: [] },
      onEvent: () => {
        throw new Error('client disconnected');
      },
    });

    expect(snap.status).toBe('done');
    expect(snap.state.trail).toEqual(['a', 'b']);
  });

  it('injects a clock so steps never guess the current date', async () => {
    const fixed = new Date('2026-09-27T12:00:00Z');
    let captured = '';

    await runPipeline({
      runId: 'r8',
      pipeline: pipe([
        {
          id: 'clock',
          title: 'clock',
          async run(ctx) {
            captured = `${ctx.clock.today}|${ctx.clock.year}`;
            return {};
          },
        },
      ]),
      initialState: { trail: [] },
      now: fixed,
    });

    expect(captured).toBe('27 September 2026|2026');
  });
});
