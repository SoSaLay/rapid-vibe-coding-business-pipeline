import { NextRequest, NextResponse } from "next/server";
import { githubStatus, setPushMode } from "@/lib/agent/github";
import { startDeploy } from "@/lib/agent/autoflow";

/** Is the agent's code on GitHub, and is anything waiting to be pushed? */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json(await githubStatus(params.id));
}

/**
 * Body: { action: "deploy" } — push what's built and follow GitHub's release (in the background) ·
 * { action: "mode", mode: "ask" | "auto" } — the owner's standing choice, for every agent ("auto" also deploys now).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  if (b.action === "mode") {
    if (b.mode !== "ask" && b.mode !== "auto") return NextResponse.json({ error: "Pick ask or auto." }, { status: 400 });
    await setPushMode(b.mode);
    if (b.deploy) startDeploy(params.id);
    return NextResponse.json(await githubStatus(params.id));
  }
  if (b.action === "deploy") {
    return NextResponse.json({ started: startDeploy(params.id) });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
