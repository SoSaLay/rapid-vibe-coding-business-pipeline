import { NextRequest, NextResponse } from "next/server";
import { loadBuild } from "@/lib/agent/build-context";
import { getOps, opsEnv, runOps } from "@/lib/agent/ops";

/** GET ?days=7 — production stats, recent failures and the kill-switch state, from the agent's run log. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 7));
  const ctx = await loadBuild(params.id);
  const ops = await getOps(params.id);
  if (!ctx.design) return NextResponse.json({ ops, ready: false, reason: "No agent design yet." });
  const env = await opsEnv(params.id, ctx.design, ctx.slug);
  if (!env) return NextResponse.json({ ops, ready: false, reason: "Set up the state database in Deployment first." });
  const [stats, failures, controls] = await Promise.all([
    runOps(ctx.dir, env, ["deploy.ops", "stats", "--days", String(days)]),
    runOps(ctx.dir, env, ["deploy.ops", "failures", "--limit", "30"]),
    runOps(ctx.dir, env, ["deploy.state", "show"]),
  ]);
  if (!stats.ok) return NextResponse.json({ ops, ready: false, reason: "Couldn't read the run log.", output: stats.out.slice(-1500) });
  return NextResponse.json({
    ops,
    ready: true,
    stats: stats.json,
    failures: failures.json ?? [],
    controls: controls.json,
    tools: ctx.design.tools.filter((t) => t.enabled).map((t) => t.name),
  });
}
