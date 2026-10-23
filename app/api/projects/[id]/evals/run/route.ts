import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { promises as fs } from "fs";
import path from "path";
import { latestArtifact } from "@/lib/store";
import { loadBuild } from "@/lib/agent/build-context";
import { unitTestAdapter } from "@/lib/agent/registry";
import { agentEnv, renderDotEnv } from "@/lib/agent/env";
import { uvRunModule } from "@/lib/agent/adapters/pytest-uv";
import { gate, summarize } from "@/lib/phases/agent-evals";
import { getEvals, saveEvals, type EvalsState } from "@/lib/agent/evals-state";
import { budgetMessage, recordSpend, spendStatus } from "@/lib/agent/spend";
import { codeFingerprint } from "@/lib/agent/code-fp";
import { practiceModel } from "@/lib/agent/design";
import { runHostedEvals } from "@/lib/agent/hosted/evals";

/**
 * Which suites/kinds a re-test after Fix it needs: the kinds and rules that were fixed, plus the
 * regression cases (so a fix can't quietly break what already worked). Null = run everything.
 */
function retestScope(state: EvalsState): string[] | null {
  const last = state.runs[state.runs.length - 1];
  const keys = Object.keys(state.fixes ?? {});
  if (!last || !keys.length) return null;
  const only = new Set(["regression"]);
  for (const k of keys) {
    if (k.startsWith("cat:")) only.add(k.slice(4));
    else {
      const label = last.gate[Number(k.slice(5))]?.label ?? "";
      if (/injection/i.test(label)) only.add("adversarial");
      else if (/capability/i.test(label)) only.add("capability");
      else if (!/regression/i.test(label)) return null; // speed, cost, unsafe calls: they need every case
    }
  }
  return [...only];
}

/**
 * Run the layers: deterministic unit tests, then the dataset × trials.
 * Body: { trials?: 1-5 (1 by default; 3 = consistency run), retest?: true (only what Fix it touched), force?: true (past the budget),
 *   practice?: true (run the agent on its cheaper practice model: a rough check, never the pinned baseline),
 *   platform?: "claude" | "chatgpt" (run against the agent's build there instead of our own) }.
 * Cases that already passed on this exact code are reused, not paid for again (see EVAL_CODE_FP in the runner).
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const trials = Math.min(5, Math.max(1, Number(body.trials) || 1));
  const budget = await spendStatus(params.id);
  if (budget.over_budget && !body.force) return NextResponse.json({ error: budgetMessage(budget), over_budget: true }, { status: 402 });
  if (body.platform === "claude" || body.platform === "chatgpt") {
    const cases = Array.isArray(body.cases) ? body.cases.filter((c: unknown) => typeof c === "string") : undefined;
    return runHosted(params.id, body.platform, trials, cases);
  }
  const ctx = await loadBuild(params.id);
  if (!ctx.design || !ctx.build) return NextResponse.json({ error: "Build the agent first." }, { status: 400 });
  try {
    await fs.access(path.join(ctx.dir, "evals", "run_evals.py"));
    await fs.access(path.join(ctx.dir, "evals", "dataset.json"));
  } catch {
    return NextResponse.json({ error: "No eval runner or dataset yet. Build the dataset first (rebuild the agent in Agent Development if it predates Evaluations)." }, { status: 400 });
  }

  const env = await agentEnv(params.id, ctx.design, ctx.slug);
  const practice = body.practice ? practiceModel(ctx.design.model.selected, ctx.design.model_endpoint) : null;
  if (body.practice && !practice) return NextResponse.json({ error: "This agent's model has no cheaper practice model." }, { status: 400 });
  const code_fp = await codeFingerprint(ctx.dir);
  await fs.writeFile(path.join(ctx.dir, ".env"), renderDotEnv(env), { mode: 0o600 });

  // Layer 1: fast deterministic checks. Layer 2: the dataset, repeated.
  const unit = await (await unitTestAdapter(params.id)).run({ dir: ctx.dir, env: { ...env, AGENT_DRY_RUN: "1" }, paths: ["tests/test_tools.py"] });
  const state = await getEvals(params.id);
  // A re-test after Fix it runs only the touched cases, then reuses the last full run's results for the rest.
  const localFile = path.join(ctx.dir, ".results", "evals-local.json");
  const prev = await fs.readFile(localFile, "utf8").then(JSON.parse).catch(() => null);
  let only = body.retest ? retestScope(state) : null;
  if (only && !(prev && prev.trials === trials && (prev.model ?? null) === (practice ?? ctx.design.model.selected) && prev.dataset_version === state.dataset_version && !(prev.only ?? []).length)) only = null;
  const run = await uvRunModule(ctx.dir, "evals.run_evals", {
    ...env,
    EVAL_TRIALS: String(trials),
    EVAL_CODE_FP: code_fp,
    ...(practice ? { AGENT_MODEL_OVERRIDE: practice } : {}),
    ...(only ? { EVAL_ONLY: only.join(",") } : {}),
  });
  if (!run.ok) return NextResponse.json({ error: "The eval run failed.", output: run.output }, { status: 500 });

  const fresh = JSON.parse(await fs.readFile(path.join(ctx.dir, ".results", "evals.json"), "utf8"));
  // What this run cost is what was actually run (before merging in reused results).
  const spent = summarize(fresh, ctx.design.model_price).spend_usd;
  await recordSpend(params.id, practice ? "practice run" : only ? "re-test after fixes" : trials > 1 ? "consistency run" : "evaluations", spent);
  const keep = (r: any) => !only!.includes(r.suite) && !only!.includes(r.category);
  const raw = only ? { ...fresh, only: [], rows: [...prev.rows.filter(keep), ...fresh.rows] } : fresh;
  await fs.writeFile(localFile, JSON.stringify(raw));
  const summary = { ...summarize(raw, ctx.design.model_price), spend_usd: spent };
  const budgets = (await latestArtifact(params.id, "product-spec"))?.payload as any;
  const checks = gate(summary, state.baseline, { latency: budgets?.agent?.latency_budget, cost: budgets?.agent?.cost_budget });
  checks.unshift({ label: "Unit tests pass", ok: unit.ok, detail: `${unit.passed} passed · ${unit.failed} failed` });
  const passed = checks.every((c) => c.ok);

  const entry = {
    at: new Date().toISOString(),
    summary,
    gate: checks,
    passed,
    unit: { ok: unit.ok, passed: unit.passed, failed: unit.failed },
    code_fp,
    full: !only,
    ...(practice ? { practice } : {}),
  };
  // A new run supersedes earlier Fix it notes and explanations.
  const next = { ...state, runs: [...state.runs, entry].slice(-20), fixes: {}, proposals: {} };
  // The first passing run becomes the pinned baseline.
  if (!next.baseline && passed && !practice) Object.assign(next, { baseline: summary, baseline_at: entry.at });
  await saveEvals(params.id, next);
  return NextResponse.json({ run: entry, baseline: next.baseline });
}

export const POST = tracked("qa", "Running the evaluations", handlePost);

/** Evaluations against the agent's build on Claude or ChatGPT (every case, with its test data). */
async function runHosted(projectId: string, platform: "claude" | "chatgpt", trials: number, cases?: string[]) {
  let raw;
  try {
    raw = await runHostedEvals(projectId, platform, { trials, cases });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "The run failed." }, { status: 400 });
  }
  const summary = summarize(raw);
  await recordSpend(projectId, `evaluations (${platform === "claude" ? "Claude" : "ChatGPT"})`, summary.spend_usd);
  const state = await getEvals(projectId);
  const baseline = state.hosted_baselines?.[platform] ?? null;
  const spec = (await latestArtifact(projectId, "product-spec"))?.payload as any;
  const checks = gate(summary, baseline, { latency: spec?.agent?.latency_budget, cost: spec?.agent?.cost_budget });
  const passed = checks.every((c) => c.ok);
  const entry = {
    at: new Date().toISOString(),
    summary,
    gate: checks,
    passed,
    unit: { ok: true, passed: 0, failed: 0 },
    full: !cases?.length,
    platform,
  };
  // A spot check of a few cases answers the caller but doesn't stand in for a full run in the history.
  if (cases?.length) return NextResponse.json({ run: entry, baseline });
  const next = { ...state, runs: [...state.runs, entry].slice(-20), fixes: {}, proposals: {} };
  if (!baseline && passed) next.hosted_baselines = { ...(state.hosted_baselines ?? {}), [platform]: summary };
  await saveEvals(projectId, next);
  return NextResponse.json({ run: entry, baseline: next.hosted_baselines?.[platform] ?? null });
}
