/**
 * Monthly cost estimate for an agent: model + host + state database + tracing +
 * login + chat page. Every line shows its assumptions. List prices as of 2026-10;
 * third-party plan prices are approximate — the UI says so.
 *
 * Cost per run is MEASURED (the Evaluations baseline) once evals have run, else
 * the design's estimate.
 */

import type { AgentDesign } from "./design";
import { parseCostBudget, parseLatencyBudget } from "./pricing";

export type HostId = "agentcore" | "railway";
export type DbId = "supabase" | "neon";

export interface CostLine {
  item: string;
  monthly: number;
  note: string;
}

export interface CostEstimate {
  runs_per_month: number;
  cost_per_run: number | null;
  cost_per_run_source: "measured" | "estimated" | "unknown";
  lines: CostLine[];
  total: number;
}

const AGENTCORE = { vcpuHour: 0.1276, gbHour: 0.0169, activeCpuShare: 0.1, memoryGb: 1 };

export function estimateMonthly(args: {
  design: AgentDesign;
  runsPerMonth: number;
  host: HostId;
  db: DbId;
  measuredCostPerRun?: number | null;
  measuredSecondsPerRun?: number | null;
}): CostEstimate {
  const { design, host, db } = args;
  const runs = Math.max(0, Math.round(args.runsPerMonth));
  const measured = args.measuredCostPerRun ?? null;
  const designed = parseCostBudget(design.est_cost_per_run);
  const perRun = measured ?? designed;
  const seconds = args.measuredSecondsPerRun ?? parseLatencyBudget(design.est_latency) ?? 15;
  const lines: CostLine[] = [];

  lines.push({
    item: `Model (${design.model.selected.split(":")[1] ?? design.model.selected})`,
    monthly: perRun !== null ? perRun * runs : 0,
    note:
      perRun === null
        ? "No cost per run yet. Run Evaluations to measure it."
        : `${runs.toLocaleString()} runs × $${perRun.toFixed(4)} per run (${measured !== null ? "measured in Evaluations" : "design estimate"})`,
  });

  if (host === "agentcore") {
    const hours = (runs * seconds) / 3600;
    const cost = hours * (AGENTCORE.vcpuHour * AGENTCORE.activeCpuShare + AGENTCORE.gbHour * AGENTCORE.memoryGb);
    lines.push({
      item: "Host: Amazon Bedrock AgentCore",
      monthly: cost,
      note: `Pay per use: ${runs.toLocaleString()} runs × ~${seconds.toFixed(0)}s, 1 GB memory, CPU billed only while working (~10%). No monthly fee.`,
    });
  } else {
    lines.push({ item: "Host: Railway", monthly: 5, note: "Hobby plan, about $5/month including $5 of usage — enough for a small always-on agent." });
  }

  // Each run writes a checkpoint + a run-log row: tiny. Free tiers cover small agents comfortably.
  lines.push({
    item: `State database: ${db === "neon" ? "Neon" : "Supabase"} Postgres`,
    monthly: 0,
    note: db === "neon" ? "Free tier (0.5 GB). Paid plans start around $19/month if you outgrow it." : "Free tier (500 MB). Pro is $25/month if you outgrow it.",
  });

  // ~1 observation per model call + 1 per tool call + 1 for the run.
  const obsPerRun = Math.max(3, design.step_limit) + design.tools.filter((t) => t.enabled).length;
  const observations = runs * obsPerRun;
  lines.push({
    item: "Tracing: Langfuse",
    monthly: observations > 50_000 ? 29 : 0,
    note: `About ${observations.toLocaleString()} observations/month (~${obsPerRun} per run). Free up to ~50k; Core is about $29/month above that.`,
  });

  const login = design.login?.selected;
  if (login === "clerk") {
    lines.push({ item: "Login & payments: Clerk", monthly: 0, note: "Free for your first ~10k monthly users. Clerk Billing adds a small fee per payment." });
  } else if (login === "supabase-auth" || login === "neon-auth") {
    lines.push({ item: `Login: ${login === "neon-auth" ? "Neon" : "Supabase"} Auth`, monthly: 0, note: "Included with the state database (free tier covers ~50k monthly users)." });
  }
  if (login && login !== "machine-key") {
    lines.push({
      item: "Chat page: Vercel",
      monthly: login === "clerk" ? 20 : 0,
      note: login === "clerk" ? "Charging users is commercial use, which needs Vercel Pro (~$20/month)." : "Hobby plan is free for non-commercial use.",
    });
  }

  const total = lines.reduce((a, l) => a + l.monthly, 0);
  return {
    runs_per_month: runs,
    cost_per_run: perRun,
    cost_per_run_source: measured !== null ? "measured" : designed !== null ? "estimated" : "unknown",
    lines,
    total,
  };
}
