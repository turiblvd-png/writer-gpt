import type { Pipeline, PipelineStep } from '@/lib/pipeline/types';
import type { ArticleMeta, Claim, GenerateInput } from '@/lib/content/types';
import type { Source } from '@/lib/ai';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SEMANTIC WRITER — 14-step pipeline. SCAFFOLD, NOT YET IMPLEMENTED.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The engine, provider routing, SEO scoring, persistence and live-progress UI
 * are all built and tested. What is missing is the 14 step definitions, which
 * you are supplying.
 *
 * To add a step:
 *
 *   1. Add the fields it produces to `SemanticState` below.
 *   2. Append a `PipelineStep<SemanticState>` to `SEMANTIC_STEPS`.
 *   3. Write its prompt in `src/lib/content/prompts.ts`.
 *
 * A step is a pure-ish function of state: it reads `ctx.state`, calls models
 * through `complete(role, …)`, and returns a patch that is merged into state.
 * That shape keeps every step independently unit-testable — feed it a state,
 * assert on the patch, no network needed.
 *
 * Available in every step via `ctx`:
 *   ctx.state     accumulated output of all prior steps (read-only)
 *   ctx.clock     { now, today, year } — never guess the date
 *   ctx.signal    AbortSignal; pass it to model calls so cancel works
 *   ctx.log(msg)  a line in the run log, streamed to the UI
 *   ctx.cite(src) register sources, de-duplicated across the run
 *   ctx.meter(u)  record token usage against the step and the run
 *   ctx.progress(f) 0–1 within a long step, folded into the overall bar
 *
 * Model roles (mapped to concrete models in src/lib/ai/index.ts):
 *   'research'  grounded web search, returns citations
 *   'reason'    planning and analysis, highest quality tier
 *   'draft'     long-form prose, the token-heavy role
 *   'structure' strict JSON extraction, cheap
 *   'verify'    grounded re-checking of written claims
 *
 * One hard constraint: Gemini cannot combine JSON mode with search grounding.
 * A step needing both must be split into a grounded step and a structuring step.
 * The provider throws rather than silently dropping one, so this cannot be
 * missed at runtime.
 */

export interface SemanticState {
  input: GenerateInput;

  // ── Carried through from the shared shape, so the editor, SEO scoring and
  //    export paths work identically for both pipelines. ──
  research?: string;
  intent?: string;
  outline?: string[];
  markdown?: string;
  meta?: ArticleMeta;
  claims?: Claim[];
  warnings: string[];

  // ── Semantic-specific fields. Extend as the 14 steps are defined. The names
  //    below are placeholders drawn from the Stitch workbench mockup; replace
  //    them with whatever your steps actually produce. ──
  /** Competitor URLs pulled from the live SERP, with parsed word/entity counts. */
  serpCompetitors?: { url: string; title?: string; words?: number; entities?: number }[];
  /** Entities to cover, with target counts — drives the Entity Matrix panel. */
  entities?: { name: string; target: number; found: number }[];
  /** Sub-topics competitors miss — the Information Gain / H2 Gaps panel. */
  contentGaps?: { heading: string; coveredBy: number; gain: number }[];
  /** JSON-LD emitted for the Schema tab. */
  schema?: string;
  sources?: Source[];
}

export function initialSemanticState(input: GenerateInput): SemanticState {
  return { input, warnings: [] };
}

/**
 * The 14 steps go here, in execution order.
 *
 * Example of the shape each one takes:
 *
 *   {
 *     id: 'serp-extract',
 *     title: 'Extract top SERP competitors',
 *     role: 'research',
 *     async run(ctx) {
 *       const res = await complete('research', {
 *         system: baseSystem(ctx.clock, ctx.state.input.language),
 *         prompt: serpExtractPrompt(ctx.state.input, ctx.clock),
 *         grounded: true,
 *         signal: ctx.signal,
 *       });
 *       ctx.meter(res.usage);
 *       ctx.cite(res.sources);
 *       ctx.log(`Parsed ${res.sources.length} competitor pages.`);
 *       return { serpCompetitors: parseCompetitors(res.text) };
 *     },
 *   }
 *
 * A step that should be skippable takes a `skipIf`, e.g.
 *   skipIf: (s) => !s.input.includeFaq
 */
export const SEMANTIC_STEPS: PipelineStep<SemanticState>[] = [
  // TODO: paste the 14 steps here.
];

export const semanticWriterPipeline: Pipeline<SemanticState> = {
  id: 'semantic-writer',
  title: 'Semantic Writer',
  steps: SEMANTIC_STEPS,
};

export const SEMANTIC_WRITER_READY = SEMANTIC_STEPS.length > 0;
