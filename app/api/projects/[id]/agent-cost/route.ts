import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { getPhaseState, getProjectSettings, saveProjectSettings } from "@/lib/store";
import { estimateMonthly, type DbId, type HostId } from "@/lib/agent/cost";
import type { AgentDesign, LoginId } from "@/lib/agent/design";
import { getEvals } from "@/lib/agent/evals-state";

const HOSTS = new Set(["agentcore", "railway"]);
const DBS = new Set(["supabase", "neon"]);

const LOGINS = new Set(["machine-key", "supabase-auth", "neon-auth", "clerk"]);

/** `login` previews an unsaved login choice from the design page (it decides the chat page line). */
async function estimate(projectId: string, login?: string | null) {
  const saved = (await getPhaseState<{ design?: AgentDesign }>(projectId, "agent-design"))?.design;
  if (!saved) return null;
  const design: AgentDesign =
    login && LOGINS.has(login) && saved.login ? { ...saved, login: { ...saved.login, selected: login as LoginId } } : saved;
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json(await estimate(params.id, req.nextUrl.searchParams.get("login")));
}

/** Body: { host?, db?, runsPerMonth? } — choices that change cost but never require rebuilding the agent. */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
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
  return NextResponse.json(await estimate(params.id, req.nextUrl.searchParams.get("login")));
}

export const POST = attributed(handlePost);
