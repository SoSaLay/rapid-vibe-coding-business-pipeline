import { NextRequest, NextResponse } from "next/server";
import { hostedOps } from "@/lib/agent/hosted/ops";

/** GET ?platform=claude|chatgpt&days=7 → how the agent on that platform is doing (its real conversations only). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const q = req.nextUrl.searchParams;
  const platform = q.get("platform") === "chatgpt" ? "chatgpt" : q.get("platform") === "claude" ? "claude" : null;
  if (!platform) return NextResponse.json({ error: "Which platform?" }, { status: 400 });
  const days = Math.min(365, Math.max(1, Number(q.get("days")) || 7));
  try {
    return NextResponse.json(await hostedOps(params.id, platform, days));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't read the agent's runs." }, { status: 500 });
  }
}
