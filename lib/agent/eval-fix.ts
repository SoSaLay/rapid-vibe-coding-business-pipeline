/**
 * Fix it for Evaluations. Two steps, so the owner sees what will happen before any code changes:
 *  1. explain: one short AI call reads the failing runs and says, in plain words, what's wrong,
 *     why, and what it will change.
 *  2. apply: the confirmed plan goes to changeAgent() (same levers as safety fixes); the agent is
 *     re-rendered and committed, and the row shows what was done until the next run.
 */

import { activeProvider } from "../llm/registry";
import { loadBuild } from "./build-context";
import { fixAndVerify } from "./fix-loop";
import { getEvals, saveEvals } from "./evals-state";
import type { Dataset, EvalCase, EvalSummary } from "../phases/agent-evals";
import { promises as fs } from "fs";
import path from "path";

export type EvalFixTarget = { kind: "category"; category: string } | { kind: "gate"; index: number };

export const evalFixKey = (t: EvalFixTarget) => (t.kind === "category" ? `cat:${t.category}` : `gate:${t.index}`);

/** Which failing runs a gate rule is about (speed/cost rules have none). */
function casesForGate(label: string, s: EvalSummary) {
  const f = s.failing_cases;
  if (/injection/i.test(label)) return f.filter((c) => c.category === "adversarial");
  if (/regression/i.test(label)) return f.filter((c) => c.suite === "regression");
  if (/capability/i.test(label)) return f.filter((c) => c.suite === "capability");
  if (/unsafe tool/i.test(label)) return f;
  return [];
}

/** The failing test cases behind a target, in full (so a fix can tell a wrong test from a wrong agent). */
export async function failingCasesFor(projectId: string, target: EvalFixTarget): Promise<EvalCase[]> {
  const state = await getEvals(projectId);
  const last = state.runs[state.runs.length - 1];
  if (!last) return [];
  const ids = new Set(
    (target.kind === "category"
      ? last.summary.failing_cases.filter((c) => c.category === target.category)
      : casesForGate(last.gate[target.index]?.label ?? "", last.summary)
    ).map((c) => c.case),
  );
  const ctx = await loadBuild(projectId);
  const dataset = await fs.readFile(path.join(ctx.dir, "evals", "dataset.json"), "utf8").then((t) => JSON.parse(t) as Dataset).catch(() => null);
  return (dataset?.cases ?? []).filter((c) => ids.has(c.id));
}

async function issueFor(projectId: string, target: EvalFixTarget): Promise<string> {
  const state = await getEvals(projectId);
  const last = state.runs[state.runs.length - 1];
  if (!last) throw new Error("Run the evaluations first.");
  const s = last.summary;
  const list = (cases: EvalSummary["failing_cases"]) =>
    cases.map((c) => `- ${c.case} (${c.category}, passed ${c.passed_trials}/${c.trials}): ${c.reason}`).join("\n");
  if (target.kind === "category") {
    const cases = s.failing_cases.filter((c) => c.category === target.category);
    if (!cases.length) throw new Error("Nothing failed in that kind of case.");
    return `EVAL CASES THAT FAILED (kind: ${target.category}):\n${list(cases)}`;
  }
  const g = last.gate[target.index];
  if (!g) throw new Error("No such rule.");
  if (g.ok) throw new Error("That rule already passes.");
  const cases = casesForGate(g.label, s);
  return `RELEASE RULE FAILED: ${g.label}. ${g.detail}\nLatency p50/p95: ${s.latency_p50 ?? "?"}s/${s.latency_p95 ?? "?"}s · cost per run: ${s.cost_per_run ?? "?"}` +
    (cases.length ? `\nRELATED FAILING CASES:\n${list(cases)}` : "");
}

export async function explainEvalFix(projectId: string, target: EvalFixTarget, save = true) {
  const key = evalFixKey(target);
  const state = await getEvals(projectId);
  const cached = state.proposals?.[key];
  if (cached) return cached;
  const issue = await issueFor(projectId, target);
  const ctx = await loadBuild(projectId);
  const r = await activeProvider().completeJson<{ explanation: string; plan: string; fixable: boolean }>({
    system:
      "You explain to a non-technical owner why their AI agent fails some tests, and what you'd change. Plain words, no code, no snake_case names. " +
      "Levers you can use: require approval on a tool, add instruction rules, rewrite a tool's code, lower the step limit, switch the model, " +
      "or correct/remove a test case that is itself wrong (its test data can't lead to the expected outcome). If the test is wrong, say so plainly " +
      "and that you'll correct the test; that IS fixable.",
    effort: "low",
    tier: "small",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        explanation: { type: "string", description: "What's going wrong and why, at most 2 short sentences." },
        plan: { type: "string", description: "What you'll change to fix it, ONE short sentence." },
        fixable: { type: "boolean", description: "False if no lever can really fix it (e.g. the test itself is wrong)." },
      },
      required: ["explanation", "plan", "fixable"],
    },
    messages: [
      {
        role: "user",
        content:
          `AGENT: ${ctx.design?.summary ?? ""}\nMODEL: ${ctx.design?.model.selected ?? ""}\n\n${issue}\n\nTHE TEST CASES:\n` +
          (await failingCasesFor(projectId, target))
            .map((c) => `- ${c.id}: expected "${c.expected}"; test data ${JSON.stringify(c.fixtures).slice(0, 800)}`)
            .join("\n")
            .slice(0, 6000),
      },
    ],
  });
  const proposal = { explanation: r.explanation.trim(), plan: r.plan.trim(), fixable: !!r.fixable };
  if (save) await saveEvals(projectId, { ...state, proposals: { ...(state.proposals ?? {}), [key]: proposal } });
  return proposal;
}

export async function applyEvalFix(projectId: string, target: EvalFixTarget) {
  const key = evalFixKey(target);
  const issue = await issueFor(projectId, target);
  const plan = (await getEvals(projectId)).proposals?.[key]?.plan ?? "";
  // Fix, then re-run exactly the failing cases (retrying up to 3 times) before it's released.
  const r = await fixAndVerify({ projectId, issue, details: plan, cases: await failingCasesFor(projectId, target) });
  if (r.fixed) {
    const state = await getEvals(projectId);
    await saveEvals(projectId, {
      ...state,
      fixes: { ...(state.fixes ?? {}), [key]: { summary: r.summary, at: new Date().toISOString(), verified: r.verified, tries: r.tries } },
    });
  }
  return r;
}

/** Fix all: apply several fixes one after another (each builds on the last), skipping ones already fixed. */
export async function applyEvalFixes(projectId: string, targets: EvalFixTarget[]) {
  const results: { key: string; fixed: boolean; summary: string; version: number | null; verified?: boolean; tries?: number; release?: boolean }[] = [];
  for (const t of targets) {
    const key = evalFixKey(t);
    if ((await getEvals(projectId)).fixes?.[key]) continue;
    try {
      const r = await applyEvalFix(projectId, t);
      results.push({ key, ...r });
    } catch (e: any) {
      results.push({ key, fixed: false, summary: e?.message || "Couldn't fix this one.", version: null });
    }
  }
  return results;
}

/** Fix all, step 1: explain every target at once (in parallel), saving the explanations together. */
export async function explainEvalFixes(projectId: string, targets: EvalFixTarget[]) {
  const items = await Promise.all(
    targets.map((t) => explainEvalFix(projectId, t, false).catch((e: any) => ({ explanation: e?.message || "Couldn't look at this one.", plan: "", fixable: false }))),
  );
  const state = await getEvals(projectId);
  const proposals = { ...(state.proposals ?? {}) };
  targets.forEach((t, i) => { if (items[i].plan) proposals[evalFixKey(t)] = items[i]; });
  await saveEvals(projectId, { ...state, proposals });
  return items;
}
