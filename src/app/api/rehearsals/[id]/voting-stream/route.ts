import { getSessionUser } from "@/lib/auth";
import { getVotingState } from "@/app/actions/votes";

export const dynamic = "force-dynamic";

/**
 * Live voting state stream (SSE). Server-side checks every 2s and pushes only
 * when the serialized state actually changed — clients see votes/comments/
 * nominations within ~2s without request spam. Each connection resolves state
 * for ITS user, so per-user fields (votedByMe, unread dots) stay correct.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      };
      req.signal.addEventListener("abort", stop);

      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };

      let lastPayload: string | null = null;
      const check = async () => {
        if (closed) return;
        try {
          const state = await getVotingState(id);
          const payload = JSON.stringify(state);
          if (payload === lastPayload) return;
          lastPayload = payload;
          enqueue(`data: ${payload}\n\n`);
          // Vote vanished or was finalized elsewhere — tell the client once,
          // then stop; it swaps to the rehearsal view.
          if (!state || state.finalizedAt) stop();
        } catch {
          stop();
        }
      };

      timer = setInterval(check, 2000);
      // SSE comment lines as heartbeats — keep proxies from idling out.
      heartbeat = setInterval(() => enqueue(`: ping\n\n`), 30_000);

      await check();
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
