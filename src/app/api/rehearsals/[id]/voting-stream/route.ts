import { getSessionUser } from '@/lib/auth';
import { getVotingState } from '@/app/actions/votes';
import { acquireLease, ResourceLimitError } from '@/lib/resource-limits';
import { RESOURCE_LIMITS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (req.signal.aborted) return new Response(null, { status: 204 });
  let lease: ReturnType<typeof acquireLease>;
  try {
    lease = acquireLease('sse', user.id, RESOURCE_LIMITS.streams, RESOURCE_LIMITS.userStreams, RESOURCE_LIMITS.streamLeaseMs);
  } catch (error) {
    if (!(error instanceof ResourceLimitError)) throw error;
    return new Response('Too many live connections', { status: 429, headers: { 'Retry-After': '30' } });
  }
  const { id } = await params;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let checking = false;
  let stop = () => {};
  const started = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        req.signal.removeEventListener('abort', stop);
        lease.release();
        try { controller.close(); } catch { /* already cancelled */ }
      };
      req.signal.addEventListener('abort', stop, { once: true });
      let lastPayload: string | null = null;
      let ticks = 0;
      const check = async () => {
        if (closed || checking) return;
        checking = true;
        try {
          if (req.signal.aborted || Date.now() - started > 5 * 60_000 || !lease.renew() || (controller.desiredSize ?? 1) <= 0) { stop(); return; }
          // Revalidate on every tick; session revocation must stop an existing stream.
          if (!await getSessionUser()) { stop(); return; }
          const state = await getVotingState(id);
          if (closed) return;
          const payload = JSON.stringify(state);
          if (payload !== lastPayload) {
            lastPayload = payload;
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          } else if (++ticks % 15 === 0) controller.enqueue(encoder.encode(': ping\n\n'));
          if (!state || state.finalizedAt) stop();
        } catch { stop(); }
        finally { checking = false; }
      };
      timer = setInterval(() => { void check(); }, 2000);
      void check();
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'private, no-store, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff',
  } });
}
