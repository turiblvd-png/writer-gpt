# Writer-GPT: project handover

This file explains what Writer-GPT is, how it is built, what has been done so far, and the rules for continuing the work. It is written for the next developer or AI agent. Read it in full before you change anything.

## 1. What the product is

Writer-GPT is a SaaS writing tool for SEO content, modelled on writer-gpt.com. Subscribers sign up, generate articles that rank in search and get cited by AI answer engines, and publish them to WordPress. The owner runs the business from a built-in Developer dashboard.

| Item | Value |
|---|---|
| Owner / developer account | turi.ishtiaq@gmail.com |
| Repository | github.com/turiblvd-png/writer-gpt |
| Working branch | `claude/lucid-archimedes-f0i2w9`. All the code is on this branch; `main` is out of date. |
| Hosting | Vercel, project `turi-tech/writer-gpt`, URL https://writer-gpt-lake.vercel.app |
| Database | Neon Postgres, connected through Vercel Storage (sets `DATABASE_URL` / `POSTGRES_URL`) |
| AI providers | DeepSeek (main, cheap, paid plan active), Gemini (only provider with live Google Search grounding; the owner's keys have hit quota limits), xAI Grok (optional) |

### Writing standard (applies to every prompt and every piece of copy)
- Optimised for SEO, AEO (answer engines) and LLM citation, and for Google NLP: entities, clear definitions, direct answers.
- User first, original, specific. No filler.
- **No em dashes.** No AI writing patterns. The banned patterns are listed in `src/lib/style/patterns.ts` and the rules in `src/lib/style/rules.ts`.
- Paragraphs of 1 to 3 sentences. No invented first-person experience. No made-up facts, prices or dates.

## 2. Stack

- Next.js 15 (App Router) with TypeScript, React client components and Tailwind. Colours are CSS variables, so light and dark themes both work.
- zod for validation, `@google/genai` for Gemini, an OpenAI-compatible client for DeepSeek and Grok, `pg` for Postgres, and `marked` for markdown.
- Tests: vitest. The last run had 34 files and 269 tests, all passing. Browser checks use Playwright.
- Node 20.9 or newer.

Commands: `npm run dev`, `npm run build`, `npm start`, `npm test`, `npm run typecheck`, `npm run lint`.

## 3. Tools (sidebar sections)

| Section | Tools and routes |
|---|---|
| Dashboard | `/` |
| Create | Generate Content `/generate`, Semantic Writer `/semantic` (main tool), Humanizer `/humanizer`, Rewrite from URL `/rewrite` |
| AI | Autopilot `/autopilot`, SEO Copilot `/copilot`, AI Visibility `/ai-visibility`, Keyword Research `/keywords`, Content Audit `/audit`, Reports `/reports` |
| Library | My Articles `/articles`, Social Media Posts `/social`, Content Calendar `/calendar` |
| Publishing | WordPress `/publishing` |
| Account | `/account`: profile, usage allowance, password change, sign out |
| Developer (owner and admins only) | `/admin` overview, `/admin/ai` AI models and keys, `/admin/subscribers`, `/admin/limits`, `/admin/activity`, `/admin/navigation` (drag and drop menu), `/admin/setup` health checks |

The menu is defined once in `src/lib/nav.ts`. The owner can reorder or hide tools from `/admin/navigation`, which is stored in platform settings and applied by `arrangeNav`.

## 4. Architecture

### 4.1 Storage (`src/lib/db/engine.ts`)
- One driver interface with two backends:
  - Postgres when any `postgres://` URL is found in the environment (`findDatabaseEnv`). This is required on Vercel, because each serverless instance has its own private `/tmp`.
  - A JSON file store under `./data` for local use.
- Records are owner-scoped: each record carries an `ownerId`, and each user sees only their own. Records saved before accounts existed belong to the owner. `collection(name, { global: true })` is for shared data such as settings and the activity log.
- The current user comes from AsyncLocalStorage (`runAs` and `currentActor` in `src/lib/auth/actor.ts`), which is set from the session cookie.
- A dropped connection (including ECONNREFUSED) is retried once.

### 4.2 Accounts and auth (`src/lib/auth/*`, `src/middleware.ts`)
- Accounts are on only when `APP_PASSWORD` is set. Without it the app runs open in single-user mode.
- Sessions are HMAC-signed cookies, so they can be checked in edge middleware. The signing secret is `AUTH_SECRET`, or `APP_PASSWORD` when that is not set. Passwords are hashed with scrypt.
- There are three roles: owner, admin and subscriber. The owner email comes from `OWNER_EMAIL` and defaults to turi.ishtiaq@gmail.com.
- `APP_PASSWORD` is also the owner's setup code and master key: the owner can always sign in with it, which fixes a forgotten password.
- Middleware sends signed-out users to `/login` and blocks admin paths for non-admins. Public paths are `/login`, `/signup`, `/api/auth/*`, `/api/health` and `/api/cron/*`.
- Sign-up can be turned off from the dashboard (platform setting `signupsOpen`).

### 4.3 AI routing (`src/lib/ai/*`, `src/lib/platform/settings.ts`)
- Every AI call names a role: `research`, `reason`, `draft`, `structure` or `verify`.
- The model for each role is resolved in this order:
  1. what the owner set in Developer → AI Models;
  2. the env vars `MODEL_<ROLE>=provider:model`;
  3. the defaults in `DEFAULT_MODELS`.
- API keys can be saved in the dashboard. They are encrypted with AES-256-GCM, and a dashboard key overrides the env var key.
- **Automatic fallback:**
  - If a provider fails (quota, bad key, outage), `complete()` tries the next provider in `fallbackOrder`, for example DeepSeek after Gemini.
  - Subscribers only ever see a friendly generic message (`CUSTOMER_AI_ERROR`). The owner and admins see the real error. Every attempt is written to the activity log.
  - The `strictSearch` setting stops the fallback for grounded research, so an answer from memory is never passed off as a live search result.
- Gemini specifics (`gemini.ts`):
  - On a quota error it steps down to cheaper models (Pro to Flash to Flash-Lite).
  - It discovers replacements when a model is withheld from a key.
  - `explainGeminiError` turns raw failures (expired or invalid key, referrer or IP restriction, location, network) into plain English.
- DeepSeek and Grok use `OpenAiCompatProvider` with a 240 s timeout. DeepSeek's `max_tokens` is 32768.
- Model lists for the dashboard dropdowns come from `catalog.ts`. The "Test" button on that page uses `testProvider`.

### 4.4 Usage, limits and activity
- `src/lib/usage/meter.ts` records the tokens and estimated cost of each call.
- `src/lib/usage/limits.ts` enforces three kinds of limit before each call (`assertWithinLimits`):
  - plan allowances;
  - a per-user request limit;
  - a global monthly budget.
- `src/lib/activity/log.ts` records AI requests, sign-ins and admin changes. They are shown at `/admin/activity`.

### 4.5 Semantic Writer (`src/lib/semantic/*`, `src/app/semantic/[id]/*`)
This is the flagship tool: a staged, entity-first workspace. It was rebuilt after a reviewer's critique.

1. **Research.** The user adds competitor URLs and the page text is extracted. Keyword and entity analysis follows.
2. **Brief** (`brief.ts`):
   - a length budget;
   - keyword usage ranges;
   - FAQ questions as H3s;
   - filters that strip noise from competitor pages.
3. **Fact sheet** (`facts.ts`, UI in `stages-facts.tsx`). This is the only place the writer may take a date, price, name or number from.
   - **By default, facts come from the competitor pages**: one quick call that takes 10 to 20 seconds. A fact two or more pages agree on is "confirmed". A fact on one page only is "reported", with the page's URL. Disagreements are "conflicting", and gaps are "unconfirmed".
   - "Check with live search" is optional (Gemini grounding only) and capped at 90 seconds.
   - Citation URLs that the model makes up are removed. The user can delete or add facts by hand.
   - The fact sheet is optional. If it is missing, Generate builds it automatically and never blocks on it.
4. **Megaprompt and outline** (`megaprompt.ts`, `prompts.ts`).
5. **Generate article** (`actions.ts`). The article is written in separate steps, each in its own request, so no single request goes over Vercel's 5-minute limit:
   - `write-draft`
   - `polish-article`
   - `revise-article`, which runs only if the quality check fails
   - `finish-article`, which writes the meta title, description and image alt texts
   - Progress is saved as `stage`, so a failed run resumes where it stopped. The UI (`stages-output.tsx`) shows each step, a running clock and errors inline.
6. **Quality check** (`quality.ts`). The article is checked against the brief: outline coverage, keywords, length and banned patterns. If it fails, one revision runs with targeted instructions.

### 4.6 Client error handling
`src/lib/http/read-json.ts` provides `readJson`. Every client fetch uses it, so a host error page such as Vercel's "An error occurred…" timeout page becomes a readable message instead of `Unexpected token 'A'… is not valid JSON`.

### 4.7 Other
- `vercel.json` runs the Autopilot cron once a day at 06:00 UTC, the Hobby plan limit. The cron needs `CRON_SECRET`.
- WordPress publishing works through an Application Password, set in env vars (`WP_*`) or on the Publishing page.
- Every API route that can run long sets `maxDuration = 300`.

## 5. Environment variables

Set these in Vercel → Settings → Environment Variables. Locally, put them in `.env.local`, copied from `.env.example`.

| Variable | Needed | Purpose |
|---|---|---|
| `DATABASE_URL` / `POSTGRES_URL` | Yes on Vercel | Neon Postgres. Set automatically by Vercel Storage. |
| `APP_PASSWORD` | Yes on any public URL | Turns on accounts. It is also the owner's setup code and master key. |
| `AUTH_SECRET` | Recommended | A separate cookie-signing secret. Changing it signs everyone out. |
| `OWNER_EMAIL` | Optional | Defaults to turi.ishtiaq@gmail.com. |
| `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` | At least one | These can also be set in Developer → AI Models instead. |
| `MODEL_RESEARCH` … `MODEL_VERIFY` | Optional | Per-role model, for example `deepseek:deepseek-chat`. |
| `CRON_SECRET` | Optional | Turns on the daily Autopilot run. |
| `WP_URL`, `WP_USERNAME`, `WP_APP_PASSWORD` | Optional | WordPress publishing. |

Vercel tip: if editing a variable gives an "already exists" error, a copy of it exists for each environment. Delete all copies and add it again once, with Production, Preview and Development all ticked.

## 6. Running locally

1. Install Node.js LTS.
2. Get the code: `git clone -b claude/lucid-archimedes-f0i2w9 https://github.com/turiblvd-png/writer-gpt.git`, or download the ZIP of that branch. On Windows the ZIP unpacks to a folder inside a folder with the same name; `cd` into the inner one, which contains `package.json`.
3. Run `npm install`. On Windows, run `copy .env.example .env.local`, then add your keys.
4. Run `npm run dev` and open http://localhost:3000.
5. If `APP_PASSWORD` is set, sign in as the owner with that password.
6. For production-like testing, run `npm run build` and then `npm start`.

### Testing without real keys
- `scripts/mock-gemini.mjs` is a fake Gemini and OpenAI-compatible server for local runs. See the README.
- `scripts/dev-postgres.mjs` runs an in-memory Postgres (PGlite) for testing the Postgres driver.
- `scripts/seed.mjs` and `scripts/seed-semantic.mjs` load demo data.
- To test Vercel behaviour, run with `VERCEL=1`.

## 7. History: problems hit and how they were fixed

| Problem | Cause | Fix |
|---|---|---|
| Banner "Saving will not work reliably on this host" | No database on Vercel | Neon connected. The app detects any postgres env var name. |
| Gemini "quota reached" with no use | Free tier gives Pro models a limit of 0 | Quota step-down, model discovery and fallback to DeepSeek |
| Owner could not sign in | Owner account did not exist yet; the browser autofilled an old password | Setup code as master key, plus clear "No account" and "Wrong password" messages |
| Customers saw provider errors | No fallback | Automatic provider fallback; customers get a generic message and the owner sees details |
| `Unexpected token 'A'… not valid JSON` while writing | Vercel's 5-minute timeout page returned as HTML | Generation split into resumable steps; `readJson` everywhere |
| Fact verification took "forever" | Live search on every run | Competitor pages are the default (10 to 20 s); live search optional, capped at 90 s |
| "Generate article" did nothing | No progress shown; a facts step blocked silently | Step progress, a clock, inline errors and resume; facts made optional |

## 8. Rules for whoever continues

- Work on the `claude/lucid-archimedes-f0i2w9` branch and push to it. Do not open a pull request unless the owner asks for one.
- **Never ask the owner to paste API keys or passwords into a chat.** Keys go in Vercel env vars or Developer → AI Models.
- Never show raw provider errors to subscribers.
- Keep every request under Vercel's 5-minute limit. Split long work into steps the client calls in turn.
- All client fetches go through `readJson`.
- New collections must respect owner scoping. Use `global: true` only for platform-wide data.
- All generated writing and UI copy follow the writing standard in section 1, with no em dashes.
- Before pushing, run `npm run typecheck`, `npm test` and `npm run build`, and keep them all passing.
- The owner is not a developer. Give instructions as short numbered steps that say exactly where to click.

## 9. Suggested next steps (not started)

1. **Billing:** Stripe subscriptions linked to the existing plans and limits, so a payment raises a user's allowance automatically.
2. **Schema markup** for Semantic Writer output, for example FAQPage, Article and event types where they fit.
3. **A full live check on the deployed site** with the owner's real DeepSeek key: sign-up, Semantic Writer end to end, Autopilot and WordPress publishing.
4. **Email** for password reset and account invites. The owner currently resets passwords from the Subscribers page.
5. **Monitoring and alerts** for AI spend against the monthly budget.
