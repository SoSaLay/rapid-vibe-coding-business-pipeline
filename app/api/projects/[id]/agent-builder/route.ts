import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { getBuilderChat, runBuilder, type BuilderMode } from "@/lib/agent/builder";

/** The Automatic Agent Builder's conversation so far. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json({ chat: await getBuilderChat(params.id) });
}

/** Body: { message, mode: "design" | "code" } — the AI changes the agent as asked and replies. */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const message = String(b.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "Type a change first." }, { status: 400 });
  const mode: BuilderMode = b.mode === "code" ? "code" : "design";
  try {
    return NextResponse.json(await runBuilder(params.id, message, mode));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "The AI couldn't make that change." }, { status: 400 });
  }
}

export const POST = attributed(handlePost);
