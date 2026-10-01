import { configuredProviders } from '@/lib/ai';
import { generateInputSchema } from '@/lib/content/types';
import { generateContentPipeline, initialGenerateState } from '@/lib/pipelines/generate-content';
import { runPipeline } from '@/lib/pipeline/engine';
import { persistGeneratedArticle } from '@/lib/content/persist';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Six model calls plus a style repair. Vercel honours up to 300s on Hobby with
// Fluid compute (the default for new projects).
export const maxDuration = 300;

/**
 * Runs the whole pipeline inside this request and streams progress as NDJSON.
 *
 * The previous design returned 202 and kept working in the background, then
 * served progress from an in-memory registry over a second request. Neither
 * survives serverless hosting: the platform freezes a function once it has
 * responded, and the progress request can land on a different instance that
 * has never heard of the run. Keeping one open streaming response means one
 * instance, alive until the article is saved.
 */
export async function POST(request: Request) {
  if (!configuredProviders().gemini) {
    return Response.json(
      { error: 'No Gemini API key configured. Set GEMINI_API_KEY in your hosting environment variables, then redeploy.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = generateInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid input.', issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };

      // Proxies drop silent connections; a heartbeat keeps the stream alive
      // through long model calls.
      const heartbeat = setInterval(() => send({ type: 'ping' }), 10_000);

      try {
        const snapshot = await runPipeline({
          runId: randomUUID(),
          pipeline: generateContentPipeline,
          initialState: initialGenerateState(parsed.data),
          signal: request.signal,
          onEvent: (event) => {
            if ('snapshot' in event) send({ type: 'snapshot', snapshot: event.snapshot });
          },
        });

        if (snapshot.status === 'done') {
          const article = await persistGeneratedArticle(snapshot);
          send({ type: 'done', snapshot, articleId: article?.id ?? null });
        } else {
          send({ type: 'error', error: snapshot.error ?? 'Generation failed.', snapshot });
        }
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'Generation failed.' });
      } finally {
        clearInterval(heartbeat);
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed by a disconnect */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
