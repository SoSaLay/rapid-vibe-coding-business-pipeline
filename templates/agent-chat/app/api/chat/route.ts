import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { send } from "@/lib/agent";
import { sse } from "@/lib/sse";

// A reply can take a few minutes (the agent works through its steps).
export const maxDuration = 300;

/** POST { conversation?: id, message } → the agent's reply, streamed. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const message = typeof b.message === "string" ? b.message.trim().slice(0, 20_000) : "";
  if (!message) return NextResponse.json({ error: "Write a message." }, { status: 400 });
  return sse(send(userId, typeof b.conversation === "string" ? b.conversation : null, message));
}
