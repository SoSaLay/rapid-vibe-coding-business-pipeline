import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { approve } from "@/lib/agent";
import { sse } from "@/lib/sse";

export const maxDuration = 300;

/** POST { conversation, approval, allow } → the rest of the agent's reply, streamed. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (typeof b.conversation !== "string" || typeof b.approval !== "string") return NextResponse.json({ error: "Which approval?" }, { status: 400 });
  return sse(approve(userId, b.conversation, b.approval, !!b.allow));
}
