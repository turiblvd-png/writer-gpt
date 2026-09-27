# Handoff — next session: Semantic Writer

## What to paste

Your 14 steps. For each one, the useful detail is:

1. **What it produces** (a field on `SemanticState`)
2. **What it needs** from earlier steps
3. **Whether it needs live search** (`grounded: true`) or strict JSON — it
   cannot have both in one Gemini call
4. **Whether it is skippable** (e.g. only when FAQs are on)

A one-line description per step is enough to start; prompts can be written as
each step is built.

## Where it goes

`src/lib/pipelines/semantic-writer.ts` — the file documents the step contract
and carries a worked example. Extend `SemanticState` with each step's output,
then append to `SEMANTIC_STEPS`.

Prompts go in `src/lib/content/prompts.ts` alongside the existing ones. Reuse
`baseSystem(clock, language)` — it carries the date anchor and the
anti-fabrication rules.

## What is already done, so the steps are all that is left

- Step engine with state threading, cancellation, progress, and failure that
  preserves completed work (8 tests)
- Provider routing across Gemini/DeepSeek/Grok by role, with retry/backoff
- Grounded research with citations + a fact-check pass (10 integration tests)
- SEO scoring: Yoast-style checks, readability, density, freshness (17 tests)
- SSE live progress, persistence, article library with six tabs
- `GET /api/health` reports which tools are ready

Wiring the pipeline to the UI is roughly: add a route that calls
`startRun(semanticWriterPipeline, initialSemanticState(input))`, and reuse the
existing progress component.

## Open questions worth deciding early

1. **Does Semantic Writer replace Generate Content or sit beside it?** Right now
   they are separate pipelines sharing an engine. If it replaces it, the wizard
   needs a mode switch instead of two nav entries.
2. **Competitor scraping.** The Stitch mockup shows fetching competitor URLs and
   parsing word/entity counts. Gemini's `urlContext` tool can read URLs directly
   (already exposed via `readUrls`), but a real scraper gives cleaner extraction.
   Which way?
3. **Where does the commercial/conversion content come from?** The critique's
   fourth point was that the article had no purchase path. If that matters for
   your affiliate model, it should be a step, not an afterthought.
4. **Cost ceiling per article.** 14 steps with grounding is meaningfully more
   expensive than 6. Worth setting a budget so role routing can be tuned to it.
