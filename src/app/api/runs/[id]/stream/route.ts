import { getLiveRun, subscribe } from '@/lib/runs/manager';
import { getRun } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-sent events for one run. Replays the current snapshot on connect so a
 * page refresh mid-generation picks up where it left off rather than showing an
 * empty progress bar.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const liveSnapshot = getLiveRun(id);
  if (!liveSnapshot) {
    // Not in memory: either finished long ago or the server restarted.
    const persisted = getRun(id);
    if (!persisted) return new Response('Run not found', { status: 404 });

    return new Response(
      `event: snapshot\ndata: ${JSON.stringify(persisted.snapshot)}\n\nevent: end\ndata: {}\n\n`,
      { headers: sseHeaders() },
    );
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const finish = () => {
        if (closed) return;
        send('end', {});
        closed = true;
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      send('snapshot', liveSnapshot);
      if (liveSnapshot.status !== 'running') return finish();

      unsubscribe = subscribe(id, (event) => {
        send(event.type === 'step:log' ? 'log' : 'snapshot', 'snapshot' in event ? event.snapshot : event);
        if (event.type === 'run:done' || event.type === 'run:error') finish();
      });

      // Proxies drop idle connections; a comment frame keeps them open.
      heartbeat = setInterval(() => send('ping', {}), 15000);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}
