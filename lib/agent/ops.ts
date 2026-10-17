/**
 * Agent pipeline — stage 7: Operations (orchestrator side). Everything reads the
 * agent's own run log in its Postgres (vendor-neutral); Langfuse is where you
 * drill into a single trace.
 */

import { promises as fs } from "fs";
import path from "path";
import { getPhaseState, savePhaseState } from "../store";
import { credentialsAdapter } from "./registry";
import { agentEnv } from "./env";
import type { AgentDesign } from "./design";
import { lastJson, scrub, sh, uvBin } from "./proc";
import type { Dataset, EvalCase } from "../phases/agent-evals";
import { writeCodebase } from "../phases/agent-engineering";

export interface Incident {
  id: string;
  opened_at: string;
  title: string;
  severity: "low" | "medium" | "high";
  what_happened: string;
  approvals: string;
  corrective_action: string;
  status: "open" | "resolved";
  resolved_at?: string;
  run_ids: number[];
}

export interface OpsState {
  owner?: string;
  oncall?: string;
  thresholds?: { min_success?: number; max_p95_s?: number; max_cost_per_run?: number; max_thumbs_down?: number };
  incidents: Incident[];
  last_alert?: { at: string; alerts: string[] };
  cases_added: { run_id: number; case_id: string; at: string }[];
  /** Audit trail of "forget this user" requests: counts only, never the deleted content. */
  forgotten?: { user: string; at: string; removed: Record<string, number> }[];
}

export async function getOps(projectId: string): Promise<OpsState> {
  return (await getPhaseState<OpsState>(projectId, "operations")) ?? { incidents: [], cases_added: [] };
}
export async function saveOps(projectId: string, s: OpsState) {
  await savePhaseState(projectId, "operations", s);
}

/** Env for the ops CLIs: the database, the model key (online evals), alert settings. */
export async function opsEnv(projectId: string, design: AgentDesign, slug: string): Promise<Record<string, string> | null> {
  const env = await agentEnv(projectId, design, slug);
  if (!env.DATABASE_URL) return null;
  const ops = await getOps(projectId);
  const t = ops.thresholds ?? {};
  return {
    ...env,
    AGENT_NAME: slug,
    ...(t.min_success !== undefined ? { ALERT_MIN_SUCCESS: String(t.min_success) } : {}),
    ...(t.max_p95_s !== undefined ? { ALERT_MAX_P95_S: String(t.max_p95_s) } : {}),
    ...(t.max_cost_per_run !== undefined ? { ALERT_MAX_COST_PER_RUN: String(t.max_cost_per_run) } : {}),
    ...(t.max_thumbs_down !== undefined ? { ALERT_MAX_THUMBS_DOWN: String(t.max_thumbs_down) } : {}),
  };
}

export async function runOps(dir: string, env: Record<string, string>, args: string[], timeoutMs = 5 * 60_000) {
  const r = await sh(uvBin(), ["run", "python", "-m", ...args], { cwd: dir, env, timeoutMs });
  return { ok: r.ok, json: lastJson(r.out), out: scrub(r.out, Object.values(env)) };
}

/**
 * Turn a failed production run into a regression case: its (redacted) input, the read-tool results it saw as
 * test data, and the owner's description of what should have happened. Bumps the dataset version.
 */
export async function addProductionCase(args: { dir: string; run: any; expected: string; mustNotCall?: string[] }): Promise<{ dataset: Dataset; caseId: string }> {
  const file = path.join(args.dir, "evals", "dataset.json");
  const dataset = JSON.parse(await fs.readFile(file, "utf8")) as Dataset;
  const fixtures: Record<string, string> = {};
  for (const c of args.run.calls ?? []) {
    if (c.side_effect === "read" && !c.error && typeof c.result === "string" && !(c.tool in fixtures)) fixtures[c.tool] = c.result;
  }
  const caseId = `production-run-${args.run.id}`;
  const turn = typeof args.run.input === "string" ? args.run.input : JSON.stringify(args.run.input);
  const next: EvalCase = {
    id: caseId,
    category: "production",
    suite: "regression",
    turns: [turn],
    fixtures,
    expected: args.expected,
    must_call: [],
    must_not_call: args.mustNotCall ?? [],
    should_abstain: false,
  };
  const updated: Dataset = {
    ...dataset,
    version: dataset.version + 1,
    created_at: new Date().toISOString(),
    cases: [...dataset.cases.filter((c) => c.id !== caseId), next],
  };
  await writeCodebase(args.dir, [{ path: "evals/dataset.json", content: JSON.stringify(updated, null, 2) + "\n", explains: "" }], `evals: add ${caseId} (dataset v${updated.version})`);
  return { dataset: updated, caseId };
}

export async function hasDatabase(projectId: string) {
  return !!(await (await credentialsAdapter(projectId)).envFor(projectId)).DATABASE_URL;
}
