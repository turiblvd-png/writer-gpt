import { complete } from '@/lib/ai';
import { extractJson } from '@/lib/content/json';
import {
  draftPrompt,
  baseSystem,
  intentPrompt,
  metaPrompt,
  outlinePrompt,
  researchPrompt,
  verifyPrompt,
} from '@/lib/content/prompts';
import { slugify } from '@/lib/content/slug';
import type { ArticleMeta, Claim, GenerateInput, GenerateState } from '@/lib/content/types';
import type { Pipeline, StepContext } from '@/lib/pipeline/types';
import { analyseDocument } from '@/lib/seo/text';
import { enforceStyle } from '@/lib/style/repair';

type Ctx = StepContext<GenerateState>;

/** Run a model call, metering usage and citations into the run automatically. */
async function call(
  ctx: Ctx,
  role: Parameters<typeof complete>[0],
  req: Parameters<typeof complete>[1],
) {
  const res = await complete(role, { ...req, signal: ctx.signal });
  ctx.meter(res.usage);
  if (res.sources.length) ctx.cite(res.sources);
  return res;
}

const system = (ctx: Ctx) => baseSystem(ctx.clock, ctx.state.input.language);

/**
 * Generate Content — the fast path, matching the four-step wizard.
 *
 * Six steps rather than one prompt, because the failures this product exists to
 * avoid happen when research, angle and drafting collapse into a single call:
 * the model writes fluently from memory instead of from evidence.
 */
export const generateContentPipeline: Pipeline<GenerateState> = {
  id: 'generate-content',
  title: 'Generate Content',
  steps: [
    {
      id: 'research',
      title: 'Research the topic',
      description: 'Grounded web search for what is true right now.',
      role: 'research',
      async run(ctx) {
        ctx.log(`Searching the web as of ${ctx.clock.today}…`);
        const res = await call(ctx, 'research', {
          system: system(ctx),
          prompt: researchPrompt(ctx.state.input, ctx.clock),
          grounded: true,
          temperature: 0.3,
        });

        ctx.log(`Gathered ${res.sources.length} sources.`);
        const warnings = [...ctx.state.warnings];
        if (res.sources.length === 0) {
          // Every downstream step trusts this brief. Ungrounded, it is memory.
          warnings.push(
            'Research returned no citations. Facts in this article are unverified, review before publishing.',
          );
          ctx.log('WARNING: no sources returned; downstream facts are unverified.');
        }
        return { research: res.text, warnings };
      },
    },

    {
      id: 'intent',
      title: 'Analyse search intent',
      description: 'What searchers want now, and the angle that can win.',
      role: 'reason',
      async run(ctx) {
        const res = await call(ctx, 'reason', {
          system: system(ctx),
          prompt: intentPrompt(ctx.state.input, ctx.state.research ?? '', ctx.clock),
          temperature: 0.4,
        });
        ctx.log('Angle selected.');
        return { intent: res.text };
      },
    },

    {
      id: 'outline',
      title: 'Build the outline',
      role: 'structure',
      async run(ctx) {
        const res = await call(ctx, 'structure', {
          system: system(ctx),
          prompt: outlinePrompt(ctx.state.input, ctx.state.research ?? '', ctx.state.intent ?? '', ctx.clock),
          json: true,
          temperature: 0.4,
        });

        const { headings } = extractJson<{ headings?: unknown }>(res.text);
        const outline = Array.isArray(headings)
          ? headings.filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
          : [];
        if (!outline.length) throw new Error('Outline step returned no headings.');

        ctx.log(`${outline.length} headings planned.`);
        return { outline };
      },
    },

    {
      id: 'draft',
      title: 'Write the article',
      role: 'draft',
      async run(ctx) {
        const { input, research, intent, outline } = ctx.state;
        ctx.log(`Drafting ~${input.targetWords} words…`);

        const res = await call(ctx, 'draft', {
          system: system(ctx),
          prompt: draftPrompt(input, research ?? '', intent ?? '', outline ?? [], ctx.clock),
          temperature: 0.7,
          maxOutputTokens: Math.min(32000, Math.ceil(input.targetWords * 3)),
        });

        // Measure the draft and repair whatever still reads as machine output.
        // The prompt asks for natural writing; this is what enforces it.
        const enforced = await enforceStyle(stripFences(res.text), {
          clock: ctx.clock,
          language: input.language,
          signal: ctx.signal,
          onProgress: (m) => ctx.log(m),
        });

        const markdown = enforced.markdown;
        const stats = analyseDocument(markdown);
        ctx.log(
          `Draft complete: ${stats.words} words, ${stats.h2} H2s, ` +
          `human score ${enforced.after.humanScore}/100` +
          (enforced.rounds ? ` after ${enforced.rounds} style repair(s)` : ''),
        );

        const warnings = [...ctx.state.warnings];
        if (enforced.stillFlagged) {
          warnings.push(
            `Draft still reads as AI-written (${enforced.after.humanScore}/100). Run it through the Humanizer.`,
          );
        }
        // Flag rather than silently re-running: a short draft is often a better
        // article, and the user should decide whether to pay for another pass.
        if (stats.words < input.targetWords * 0.6) {
          warnings.push(`Draft is ${stats.words} words against a ${input.targetWords}-word target.`);
        }
        return { markdown, warnings };
      },
    },

    {
      id: 'metadata',
      title: 'Generate SEO metadata',
      role: 'structure',
      async run(ctx) {
        const res = await call(ctx, 'structure', {
          system: system(ctx),
          prompt: metaPrompt(ctx.state.input, ctx.state.markdown ?? '', ctx.clock),
          json: true,
          temperature: 0.5,
        });

        const raw = extractJson<Partial<ArticleMeta>>(res.text);
        const seoTitle = (raw.seoTitle ?? '').trim() || firstHeading(ctx.state.markdown ?? '') || ctx.state.input.topic;
        const meta: ArticleMeta = {
          seoTitle,
          metaDescription: (raw.metaDescription ?? '').trim(),
          slug: slugify(raw.slug?.trim() || seoTitle),
          focusKeyword: (raw.focusKeyword ?? '').trim() || ctx.state.input.topic,
          keywords: Array.isArray(raw.keywords)
            ? raw.keywords.filter((k): k is string => typeof k === 'string').slice(0, 12)
            : [],
        };

        ctx.log(`Focus keyword: "${meta.focusKeyword}".`);
        return { meta };
      },
    },

    {
      id: 'verify',
      title: 'Fact-check the draft',
      description: 'Re-checks claims against live search and flags the unsupported ones.',
      role: 'verify',
      async run(ctx) {
        const res = await call(ctx, 'verify', {
          system: system(ctx),
          prompt: verifyPrompt(ctx.state.markdown ?? '', ctx.state.research ?? '', ctx.clock),
          grounded: true,
          temperature: 0.1,
        });

        let claims: Claim[] = [];
        try {
          // Grounded mode forbids JSON mode on Gemini, so the model returns
          // prose-wrapped JSON and we recover the object.
          const parsed = extractJson<{ claims?: unknown }>(res.text);
          if (Array.isArray(parsed.claims)) {
            claims = parsed.claims
              .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
              .map((c) => ({
                text: String(c.text ?? ''),
                sourceUri: typeof c.sourceUri === 'string' ? c.sourceUri : null,
                verdict: (['supported', 'unsupported', 'contradicted'] as const).includes(c.verdict as never)
                  ? (c.verdict as Claim['verdict'])
                  : 'unsupported',
                note: typeof c.note === 'string' ? c.note : undefined,
              }))
              .filter((c) => c.text.length > 0);
          }
        } catch (err) {
          // A failed parse must not throw away a finished article.
          ctx.log(`Could not parse fact-check output: ${err instanceof Error ? err.message : err}`);
        }

        const suspect = claims.filter((c) => c.verdict !== 'supported');
        const warnings = [...ctx.state.warnings];
        if (suspect.length) {
          warnings.push(`${suspect.length} claim(s) could not be verified. Review before publishing.`);
        }
        ctx.log(
          claims.length
            ? `Checked ${claims.length} claims, ${claims.length - suspect.length} supported, ${suspect.length} flagged.`
            : 'No checkable claims extracted.',
        );
        return { claims, warnings };
      },
    },
  ],
};

function stripFences(text: string): string {
  const fenced = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n?```\s*$/i.exec(text.trim());
  return (fenced?.[1] ?? text).trim();
}

function firstHeading(markdown: string): string {
  return /^\s{0,3}#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';
}

export function initialGenerateState(input: GenerateInput): GenerateState {
  return { input, warnings: [] };
}
