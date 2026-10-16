import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { latestArtifact } from "@/lib/store";
import { loadBuild } from "@/lib/agent/build-context";
import { unitTestAdapter } from "@/lib/agent/registry";
import { agentEnv, renderDotEnv } from "@/lib/agent/env";
import { uvRunModule } from "@/lib/agent/adapters/pytest-uv";
import { gate, summarize } from "@/lib/phases/agent-evals";
import { getEvals, saveEvals } from "@/lib/agent/evals-state";

/** Run the layers: deterministic unit tests, then the dataset × trials. Body: { trials?: 1-5 }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const trials = Math.min(5, Math.max(1, Number(body.trials) || 3));
  const ctx = await loadBuild(params.id);
  if (!ctx.design || !ctx.build) return NextResponse.json({ error: "Build the agent first." }, { status: 400 });
  try {
    await fs.access(path.join(ctx.dir, "evals", "run_evals.py"));
    await fs.access(path.join(ctx.dir, "evals", "dataset.json"));
  } catch {
    return NextResponse.json({ error: "No eval runner or dataset yet. Build the dataset first (rebuild the agent in Engineering if it predates Evaluations)." }, { status: 400 });
  }

  const env = await agentEnv(params.id, ctx.design, ctx.slug);
  await fs.writeFile(path.join(ctx.dir, ".env"), renderDotEnv(env), { mode: 0o600 });

  // Layer 1: fast deterministic checks. Layer 2: the dataset, repeated.
  const unit = await (await unitTestAdapter(params.id)).run({ dir: ctx.dir, env: { ...env, AGENT_DRY_RUN: "1" }, paths: ["tests/test_tools.py"] });
  const run = await uvRunModule(ctx.dir, "evals.run_evals", { ...env, EVAL_TRIALS: String(trials) });
  if (!run.ok) return NextResponse.json({ error: "The eval run failed.", output: run.output }, { status: 500 });

  const raw = JSON.parse(await fs.readFile(path.join(ctx.dir, ".results", "evals.json"), "utf8"));
  const summary = summarize(raw, ctx.design.model_price);
  const state = await getEvals(params.id);
  const budgets = (await latestArtifact(params.id, "product-spec"))?.payload as any;
  const checks = gate(summary, state.baseline, { latency: budgets?.agent?.latency_budget, cost: budgets?.agent?.cost_budget });
  checks.unshift({ label: "Unit tests pass", ok: unit.ok, detail: `${unit.passed} passed · ${unit.failed} failed` });
  const passed = checks.every((c) => c.ok);

  const entry = { at: new Date().toISOString(), summary, gate: checks, passed, unit: { ok: unit.ok, passed: unit.passed, failed: unit.failed } };
  const next = { ...state, runs: [...state.runs, entry].slice(-20) };
  // The first passing run becomes the pinned baseline.
  if (!next.baseline && passed) Object.assign(next, { baseline: summary, baseline_at: entry.at });
  await saveEvals(params.id, next);
  return NextResponse.json({ run: entry, baseline: next.baseline });
}
