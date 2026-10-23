import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { getBuilderChat, runBuilder } from "@/lib/agent/builder";
import { bridgeAllowed, restartLocalIfRunning } from "@/lib/agent/local";

/**
 * The Agent Helper on the agent's own page (Create tab): the same Automatic Agent Changer as Agent Design,
 * working on the built agent. Called only by the agent's local server, with its private bridge key.
 */

async function guard(req: NextRequest, id: string) {
  return (await bridgeAllowed(id, req.headers.get("x-bridge-key"))) ? null : NextResponse.json({ error: "Not allowed." }, { status: 403 });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await guard(req, params.id);
  if (denied) return denied;
  return NextResponse.json({ chat: await getBuilderChat(params.id) });
}

/** Body: { message }. A change that took effect restarts the agent on the new code, just after this reply. */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await guard(req, params.id);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const message = String(b.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "Type what to change first." }, { status: 400 });
  try {
    const r = await runBuilder(params.id, message, "code");
    // Answer first: the restart stops the very server that's relaying this reply.
    if (r.changed) setTimeout(() => restartLocalIfRunning(params.id).catch(() => {}), 1500);
    return NextResponse.json({ ...r, restarting: r.changed });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "The helper couldn't make that change." }, { status: 400 });
  }
}

export const POST = attributed(handlePost);
