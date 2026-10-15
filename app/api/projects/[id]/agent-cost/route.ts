import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, getProjectSettings, saveProjectSettings } from "@/lib/store";
import { estimateMonthly, type DbId, type HostId } from "@/lib/agent/cost";
import type { AgentDesign } from "@/lib/agent/design";
import { getEvals } from "@/lib/agent/evals-state";

const HOSTS = new Set(["agentcore", "railway"]);
const DBS = new Set(["supabase", "neon"]);

async function estimate(projectId: string) {
  const design = (await getPhaseState<{ design?: AgentDesign }>(projectId, "agent-design"))?.design;
  if (!design) return null;
  const settings = await getProjectSettings(projectId);
  const host = (settings.agentStack?.runtime as HostId) || "agentcore";
  const db = (settings.agentStack?.["state-db"] as DbId) || "supabase";
  const baseline = (await getEvals(projectId)).baseline;
  return {
    host,
    db,
    estimate: estimateMonthly({
      design,
      runsPerMonth: settings.agentRunsPerMonth ?? design.runs_per_month ?? 300,
      host,
      db,
      measuredCostPerRun: baseline?.cost_per_run ?? null,
      measuredSecondsPerRun: baseline?.latency_p50 ?? null,
    }),
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json(await estimate(params.id));
}

/** Body: { host?, db?, runsPerMonth? } — choices that change cost but never require rebuilding the agent. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const settings = await getProjectSettings(params.id);
  const stack = { ...(settings.agentStack ?? {}) };
  if (HOSTS.has(body.host)) stack.runtime = body.host;
  if (DBS.has(body.db)) stack["state-db"] = body.db;
  const runs = Number(body.runsPerMonth);
  await saveProjectSettings(params.id, {
    agentStack: stack,
    ...(Number.isFinite(runs) && runs >= 0 ? { agentRunsPerMonth: Math.min(10_000_000, Math.round(runs)) } : {}),
  });
  return NextResponse.json(await estimate(params.id));
}
