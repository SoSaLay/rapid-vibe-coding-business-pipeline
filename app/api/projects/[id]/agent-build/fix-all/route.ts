import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { tracked } from "@/lib/agent/activity";
import { getPhaseState } from "@/lib/store";
import { fixSafetyIssue } from "@/lib/agent/fix";
import { fixAndVerify } from "@/lib/agent/fix-loop";
import { applyEvalFixes } from "@/lib/agent/eval-fix";
import { loadBuild } from "@/lib/agent/build-context";
import { startAutoflow } from "@/lib/agent/autoflow";
import type { SecurityReport } from "@/lib/phases/agent-security";
import type { Dataset } from "@/lib/phases/agent-evals";
import { fixAllTargets } from "@/lib/agent/fix-all";

/**
 * Fix all issues: everything known to be broken, one after another (each fix builds on the last):
 *  1. red safety items,  2. failing example tasks,  3. the latest evaluation failures.
 * For 2 and 3 the AI decides per problem: fix the agent, or correct/remove a test that is itself wrong.
 * Then the agent is re-tested (and redeployed if you deploy automatically).
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const { safety, examples, evalTargets } = await fixAllTargets(params.id);
  const results: { area: string; fixed: boolean; summary: string; verified?: boolean; tries?: number }[] = [];
  let changed = false;

  for (const t of safety) {
    // An earlier fix may already have closed this one (e.g. the injection check closes its threats).
    const now = (await getPhaseState<{ report?: SecurityReport }>(params.id, "security"))?.report;
    const open = t.kind === "check" ? now?.checks.find((c) => c.id === t.id)?.status === "fail" : now?.threat_model.entry_points[t.index]?.mitigated === false;
    if (!open) continue;
    try {
      const r = await fixSafetyIssue(params.id, t);
      results.push({ area: "safety", fixed: r.fixed, summary: r.summary });
    } catch (e: any) {
      results.push({ area: "safety", fixed: false, summary: e?.message || "Couldn't fix this one." });
    }
  }

  if (examples.length) {
    const ctx = await loadBuild(params.id);
    const dataset = await fs.readFile(path.join(ctx.dir, "evals", "dataset.json"), "utf8").then((t) => JSON.parse(t) as Dataset).catch(() => null);
    const cases = (dataset?.cases ?? []).filter((c) => examples.some((e) => c.id === `example-${e.index + 1}` || c.example_input === e.input));
    const issue =
      `EXAMPLE TASKS THAT FAILED IN ENGINEERING'S TESTS:\n` +
      examples.map((e) => `- Task ${e.index + 1}: ${e.input}\n  Should: ${e.expected}\n  What happened: ${e.reason}`).join("\n");
    try {
      const r = await fixAndVerify({ projectId: params.id, issue, cases });
      results.push({ area: "example tasks", fixed: r.release, summary: r.summary, verified: r.verified, tries: r.tries });
      changed ||= r.release;
    } catch (e: any) {
      results.push({ area: "example tasks", fixed: false, summary: e?.message || "Couldn't fix the example tasks." });
    }
  }

  if (evalTargets.length) {
    try {
      for (const r of await applyEvalFixes(params.id, evalTargets)) {
        results.push({ area: "evaluations", fixed: !!r.release, summary: r.summary, verified: r.verified, tries: r.tries });
        changed ||= !!r.release;
      }
    } catch (e: any) {
      // One area failing must not lose what the others fixed (or the whole request).
      results.push({ area: "evaluations", fixed: false, summary: e?.message || "Couldn't fix the evaluation failures." });
    }
  }

  // Re-test what changed (tests → safety review → deploy, if you deploy automatically).
  if (changed) startAutoflow(params.id, req.nextUrl.origin, undefined, { codeReady: true });
  return NextResponse.json({ results });
}

/** Anything unexpected still answers in JSON (a plain 500 page shows up as "That didn't work" with no reason). */
async function safePost(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    return await handlePost(req, ctx);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Fix all failed." }, { status: 500 });
  }
}

export const POST = tracked("engineering", "Fixing all issues", safePost);

/** How many problems Fix all would take on (safety items, failing example tasks as one, evaluation failures). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const t = await fixAllTargets(params.id);
  return NextResponse.json({ total: t.total, safety: t.safety.length, examples: t.examples.length, evaluations: t.evalTargets.length });
}
