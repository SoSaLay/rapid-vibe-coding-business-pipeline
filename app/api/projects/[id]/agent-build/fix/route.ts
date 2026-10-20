import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { fixSafetyIssue, type FixTarget } from "@/lib/agent/fix";

/** Body: { target: { kind: "check", id } | { kind: "threat", index }, details? } — the AI fixes one safety issue in the agent. */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const t = b.target;
  const target: FixTarget | null =
    t?.kind === "check" && typeof t.id === "string" ? { kind: "check", id: t.id } : t?.kind === "threat" && Number.isInteger(t.index) ? { kind: "threat", index: t.index } : null;
  if (!target) return NextResponse.json({ error: "Say what to fix." }, { status: 400 });
  try {
    const r = await fixSafetyIssue(params.id, target, String(b.details ?? "").slice(0, 2000));
    return NextResponse.json(r, { status: r.fixed ? 200 : 422 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "The fix didn't work." }, { status: 400 });
  }
}

export const POST = tracked("engineering", "Fixing a safety issue", handlePost);
