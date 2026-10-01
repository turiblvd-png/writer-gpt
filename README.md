# Writer-GPT

AI SEO content engine. Four tools on one research-grounded pipeline.

| Tool | Status |
| --- | --- |
| **Generate Content** | Working — 6-step grounded pipeline |
| **Semantic Writer** | Working — 14-stage workspace |
| **Humanizer** | Working, 3 stealth modes |
| **Rewrite from URL** | Working, fact-preserving |

The marketing site lives in [`marketing/`](./marketing) and is served separately.

## Run it

Needs Node 20.9 or newer. There are no native modules, so installs cannot
fail on a platform mismatch.

```bash
git clone -b claude/lucid-archimedes-f0i2w9 https://github.com/turiblvd-png/writer-gpt.git
cd writer-gpt
npm install
cp .env.example .env.local     # add GEMINI_API_KEY
npm run dev                    # http://localhost:3000
```

Get a Gemini key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

Without a key the whole UI still runs, and so does everything that needs no
model: SEO scoring, the AI-tell detector, n-grams, TF-IDF salience,
skip-grams and similarity. Only the generate actions return a 503, with a
message saying which variable to set.

To see the tools populated rather than empty:

```bash
node scripts/seed.mjs            # sample article, for the SEO panels
node scripts/seed-semantic.mjs   # Semantic Writer project with a real corpus
```

### Deploying to Vercel

Two settings, both in the Vercel dashboard:

1. **Database.** Storage → Create Database → **Neon** (serverless Postgres) →
   connect it to this project. That sets `DATABASE_URL` automatically.
2. **API key.** Settings → Environment Variables → `GEMINI_API_KEY`.

Then deploy the latest commit (Deployments → the newest build; "Redeploy" on
an old build reuses that old commit).

Check `/api/health`: `storage.driver` should read `postgres`, `perInstance`
`false` and `writable` `true`.

**Why a database is required there.** A serverless host runs many short-lived
instances, each with a private disk. Without a shared database, a project
saved by one request is invisible to the next, which is exactly how "Create
project" failed. `DATABASE_URL` switches storage to Postgres; without it the app
uses a JSON file, which is right for local development and single servers with
a persistent disk (set `DATABASE_PATH` there).

**Why generation streams.** Each generate request runs the whole job and
streams progress back on the same connection. Serverless platforms freeze a
function once it has replied, so the earlier "reply now, keep working in the
background" design never finished on Vercel. Routes that call models set
`maxDuration = 300`, which Vercel honours with Fluid compute, the default for
new projects.

**Why model names do not break it.** Google retires Gemini model IDs on a
roughly yearly cycle, and a retired ID returns 404 on every call. When that
happens the provider lists the models the key can use and switches to the
newest stable one of the same tier, once, and logs it.

### Testing without a key

`scripts/mock-gemini.mjs` stands in for the Gemini API so every tool can run
end to end locally, and `scripts/dev-postgres.mjs` stands in for Postgres:

```bash
node scripts/dev-postgres.mjs 55433 &
node scripts/mock-gemini.mjs 8787 &      # RETIRE=2.5 simulates retired models
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55433/postgres?sslmode=disable" \
  DATABASE_POOL_MAX=1 GEMINI_API_KEY=test GEMINI_BASE_URL=http://127.0.0.1:8787 npm run dev
```

The mock proves the plumbing, not the writing quality. Only a real key tests
that.

## The house style, shared by all four tools

`src/lib/style` holds one standard every tool inherits, so they cannot drift:
natural writing, AEO and LLM citability, Google NLP parseability, originality
against sources, a reader-first override, and factual limits.

It is **measured, not requested**. `detect.ts` scores a draft 0-100 from two
signals: stock phrases, and the statistical evenness of sentence rhythm. The
second matters more. A draft can contain no banned phrases and still read as
generated because every sentence is the same length, so a coefficient of
variation under 0.35 is penalised on its own.

`repair.ts` closes the loop. If a draft scores below threshold, the specific
findings go back to the model ("you used 'delve into' twice, every sentence is
17 words"). A round that makes the score worse is discarded rather than
silently accepted.

`sanitize.ts` makes the em dash ban a guarantee rather than a request, choosing
comma, full stop or bullet by context. An en dash between numbers is correct
typography, so `October 15-18` is left alone.

The rule is applied to this repo's own interface copy too, guarded by a test.

## Humanizer

Three stealth modes trading cost against depth: Mini fixes surface tells,
High restructures paragraphs. The text is measured first so the rewrite prompt
names the tells actually present, rather than asking generically for natural
writing. Facts are held constant throughout, and output is stored separately
from My Articles so a humanized copy never shadows the original.

Language is detected from the text, so a Spanish draft is not rewritten into
English because the picker defaulted to Automatic.

## Rewrite from URL

Facts are extracted into an explicit list first, and the writer works from that
list rather than the source prose. Handing a model the source and asking it to
"rewrite" reliably produces clause-level paraphrase, which reads as duplicate
content and never outranks the original.

Originality is then **measured**: `similarity.ts` computes containment over
word 5-grams plus the longest verbatim run. Above 10% overlap or a 15-word
shared run, the rewrite is redone once with that feedback. What survives is
saved with the score visible, and a final pass checks no required fact was lost.

## Known limits

- **Runs live in process memory.** Fine for one instance; horizontal scaling
  needs a real queue (Redis/BullMQ) behind `src/lib/runs/manager.ts`.
- **No auth, users, plans or credits.** Single-tenant as it stands.
- **SQLite.** The repository seam in `src/lib/db/store.ts` is small enough to
  swap for Postgres in one file.
- **Model IDs drift.** Defaults in `src/lib/ai/index.ts` are overridable by env.
- **A failed run is not yet resumable from the UI** — the snapshot preserves
  completed steps, but no "resume" button is wired.
- **Passive-voice and transition detection are English-only heuristics.** The
  same is true of the n-gram stop-word list, so corpus analysis is weaker for
  non-English projects.
- **Competitor extraction cannot read JS-rendered pages.** It parses server HTML;
  a client-rendered article returns a clear error rather than empty text.
- **A JSON store suits this app's data volume, not any volume.** It rewrites the
  whole file on each save, which is fine for hundreds of records and wrong for
  tens of thousands. Move to Postgres before that point.
- **Long generations run inside the request.** A 14-stage generate is four model
  calls, and a Rewrite is five; it works, but a serverless host with a short
  timeout needs the run moved onto the queue seam in `src/lib/runs/manager.ts`.
- **The AI-tell catalogue is English-only.** Phrase detection and the passive
  and transition heuristics do not transfer to the other languages in the picker,
  so the human score is only meaningful for English.
- **A high human score is not an AI-detector bypass**, and is not sold as one.
  It measures the specific patterns in `style/patterns.ts`. Commercial detectors
  use different signals.
- **Humanizer holds facts constant by instruction and a fact-check pass**, not by
  constraint. Verify figures in regulated or medical copy.
