import type { ChatEvent } from "./agent";

/** Stream chat events to the browser as server-sent events. */
export function sse(events: AsyncGenerator<ChatEvent>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      try {
        for await (const e of events) ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      } catch (e: any) {
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message: e?.message ?? "Something went wrong." })}\n\n`));
      }
      ctrl.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" } });
}
