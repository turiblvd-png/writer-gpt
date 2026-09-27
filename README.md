# Writer-GPT

AI SEO content engine. Four tools on one research-grounded pipeline.

| Tool | Status |
| --- | --- |
| **Generate Content** | Working — 6-step grounded pipeline |
| **Semantic Writer** | Engine built, 14 step definitions pending |
| **Humanizer** | Not built |
| **Rewrite from URL** | Not built |

The marketing site lives in [`marketing/`](./marketing) and is served separately.

## Run it

```bash
npm install
cp .env.example .env.local     # add GEMINI_API_KEY
npm run dev                    # http://localhost:3000
```

Without a key the UI runs and the SEO tooling works; generation returns a clear
503 rather than failing obscurely.

```bash
npm test                # 38 tests, no network or API key needed
npm run typecheck
node scripts/seed.mjs   # loads a sample article to inspect the SEO panels
```

## Why it is built this way

The engine is shaped around four failures observed in a real generated article
(a Six Kings Slam piece written three weeks before the 2026 event):

1. **It was temporally stale.** It read as a 2024/2025 retrospective while live
   intent was about the upcoming 2026 event.
2. **It invented a specific.** A confident, plausible, false claim about a venue
   rename.
3. **It chased an unwinnable head term** instead of a reachable modified query.
4. **It had no conversion path.**

Every conventional SEO check passed. So the countermeasures are structural, not
prompt tweaks:

- **The date is injected, never inferred.** `RunClock` is passed to every step
  and pasted into every system prompt. A model asked about a recurring event
  otherwise defaults to the latest one in its training data.
- **Research is grounded and separate from drafting.** The draft step only sees
  the research brief. A provider that cannot ground throws rather than quietly
  returning remembered text.
- **A fact-check step re-reads the finished draft** against live search and
  flags unsupported claims as run warnings.
- **Intent analysis is its own step**, tasked with naming a *winnable* query.
- **Freshness is scored.** `analyseSeo` detects time-bound topics (from body
  years as well as the title) and weights that check double.

## Architecture

```
src/lib/
  ai/          provider-agnostic LLM contract; Gemini + OpenAI-compatible adapters
  pipeline/    step engine: state threading, progress, cancellation, resume
  pipelines/   concrete pipelines (generate-content, semantic-writer)
  content/     prompts, types, markdown rendering, JSON recovery
  seo/         deterministic scoring — no model call, no cost
  db/          SQLite behind a narrow repository
  runs/        in-process run registry + SSE fan-out
src/app/       Next.js App Router pages and API routes
```

### Model roles, not model names

Steps request a *role*; roles map to models in `src/lib/ai/index.ts`. Retune
cost/quality with env vars, no code change:

```bash
MODEL_DRAFT=deepseek:deepseek-chat     # bulk prose on the cheap provider
MODEL_RESEARCH=gemini:gemini-2.5-flash # grounding stays on Gemini
```

Roles: `research` (grounded) · `reason` · `draft` · `structure` (JSON) ·
`verify` (grounded).

### Adding a pipeline step

A step reads state, calls models, and returns a patch. That shape makes each one
unit-testable with no network — see `src/lib/pipelines/generate-content.test.ts`,
which drives all six steps against a scripted provider.

```ts
{
  id: 'serp-extract',
  title: 'Extract top SERP competitors',
  role: 'research',
  async run(ctx) {
    const res = await complete('research', {
      system: baseSystem(ctx.clock, ctx.state.input.language),
      prompt: serpExtractPrompt(ctx.state.input, ctx.clock),
      grounded: true,
      signal: ctx.signal,
    });
    ctx.meter(res.usage);
    ctx.cite(res.sources);
    return { serpCompetitors: parse(res.text) };
  },
}
```

**Constraint:** Gemini cannot combine JSON mode with search grounding. A step
needing both must split into a grounded step and a structuring step. The
provider throws rather than silently dropping one.

## Known limits

- **Runs live in process memory.** Fine for one instance; horizontal scaling
  needs a real queue (Redis/BullMQ) behind `src/lib/runs/manager.ts`.
- **No auth, users, plans or credits.** Single-tenant as it stands.
- **SQLite.** The repository seam in `src/lib/db/store.ts` is small enough to
  swap for Postgres in one file.
- **Model IDs drift.** Defaults in `src/lib/ai/index.ts` are overridable by env.
- **A failed run is not yet resumable from the UI** — the snapshot preserves
  completed steps, but no "resume" button is wired.
- **Passive-voice and transition detection are English-only heuristics.**
