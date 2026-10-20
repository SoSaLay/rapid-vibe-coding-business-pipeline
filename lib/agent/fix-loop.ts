/**
 * Fix and check: change the agent for ONE problem, then right away re-run only the test cases that failed
 * (on this machine, one try each — cheap and quick). If they still fail, try again with what went wrong,
 * up to 3 times. Stops early when a try makes no progress or the monthly budget is used up. Only a fix
 * that makes those cases pass goes on to be re-tested, released and live-checked.
 */

import { promises as fs } from "fs";
import path from "path";
import { loadBuild } from "./build-context";
import { changeAgent } from "./fix";
import { agentEnv, renderDotEnv } from "./env";
import { uvRunModule } from "./adapters/pytest-uv";
import { recordSpend, spendStatus } from "./spend";
import { codeFingerprint } from "./code-fp";
import { summarize, type Dataset, type EvalCase } from "../phases/agent-evals";

export interface FixAttempt {
  summary: string;
  /** Still failing after this try: case id → why. */
  failing: Record<string, string>;
}

export interface FixResult {
  fixed: boolean;
  /** The failing cases were re-run after the fix and now pass. */
  verified: boolean;
  /** Ready to be re-tested and released: verified, or there were no test cases to re-run (e.g. a release error). */
  release: boolean;
  tries: number;
  summary: string;
  version: number | null;
  attempts: FixAttempt[];
}

const MAX_TRIES = 3;

/** Re-run just these cases (if they still exist: a fix may have corrected or removed a wrong test). */
async function recheck(projectId: string, ids: string[]): Promise<Record<string, string> | null> {
  const ctx = await loadBuild(projectId);
  if (!ctx.design) return null;
  const dataset = await fs.readFile(path.join(ctx.dir, "evals", "dataset.json"), "utf8").then((t) => JSON.parse(t) as Dataset).catch(() => null);
  const still = ids.filter((id) => dataset?.cases.some((c) => c.id === id));
  // None of them exist in the current test cases (an older version, or a fix removed a wrong test): nothing to run.
  if (!still.length) return null;
  const env = await agentEnv(projectId, ctx.design, ctx.slug);
  await fs.writeFile(path.join(ctx.dir, ".env"), renderDotEnv(env), { mode: 0o600 });
  const run = await uvRunModule(ctx.dir, "evals.run_evals", { ...env, EVAL_TRIALS: "1", EVAL_CASES: still.join(","), EVAL_CODE_FP: await codeFingerprint(ctx.dir) });
  if (!run.ok) return Object.fromEntries(still.map((id) => [id, `The check couldn't run: ${run.output.slice(-300)}`]));
  const raw = JSON.parse(await fs.readFile(path.join(ctx.dir, ".results", "evals.json"), "utf8"));
  await recordSpend(projectId, "checking a fix", summarize(raw, ctx.design.model_price).spend_usd);
  return Object.fromEntries((raw.rows ?? []).filter((r: any) => !r.passed).map((r: any) => [r.case, r.reason]));
}

/** Fix one problem and check it on exactly the cases that failed; retries with feedback. */
export async function fixAndVerify(args: { projectId: string; issue: string; cases: EvalCase[]; details?: string }): Promise<FixResult> {
  const { projectId, issue, cases } = args;
  const ids = cases.map((c) => c.id);
  const attempts: FixAttempt[] = [];
  let version: number | null = null;
  let anyFixed = false;

  for (let t = 1; t <= MAX_TRIES; t++) {
    if (t > 1 && (await spendStatus(projectId)).over_budget) break;
    const feedback = attempts.length
      ? `\n\nEARLIER TRIES THAT DIDN'T WORK (do something different):\n` +
        attempts
          .map((a, i) => `Try ${i + 1}: ${a.summary}\nStill failing: ${Object.entries(a.failing).map(([id, why]) => `${id}: ${why}`).join(" | ").slice(0, 2500)}`)
          .join("\n")
      : "";
    const current = await currentCases(projectId, ids, cases);
    const r = await changeAgent({ projectId, issue: issue + feedback, details: args.details, kind: "quality", keepTests: false, cases: current });
    if (!r.fixed) {
      attempts.push({ summary: r.summary, failing: {} });
      break;
    }
    anyFixed = true;
    version = r.version ?? version;
    // No test cases to re-run (e.g. a release error): the fix goes straight on to be re-tested.
    if (!ids.length) return { fixed: true, verified: false, release: true, tries: t, summary: r.summary, version, attempts: [{ summary: r.summary, failing: {} }] };
    const failing = await recheck(projectId, ids);
    if (failing === null) {
      // Nothing left to re-run: verified only if this fix corrected/removed those tests itself.
      return { fixed: true, verified: (r.tests_changed ?? 0) > 0, release: true, tries: t, summary: r.summary, version, attempts: [...attempts, { summary: r.summary, failing: {} }] };
    }
    attempts.push({ summary: r.summary, failing });
    if (!Object.keys(failing).length) return { fixed: true, verified: true, release: true, tries: t, summary: r.summary, version, attempts };
    // No progress: the same cases fail again.
    const prev = attempts[attempts.length - 2];
    if (prev && sameKeys(prev.failing, failing)) break;
  }
  const last = attempts[attempts.length - 1];
  const left = last ? Object.keys(last.failing) : [];
  return {
    fixed: anyFixed,
    verified: false,
    release: false,
    tries: attempts.length,
    summary: left.length
      ? `Tried ${attempts.length} time${attempts.length === 1 ? "" : "s"}; still failing: ${left.join(", ")}. ${Object.values(last!.failing)[0]?.slice(0, 200) ?? ""}`
      : last?.summary ?? "Couldn't fix it automatically.",
    version,
    attempts,
  };
}

function sameKeys(a: Record<string, string>, b: Record<string, string>) {
  const x = Object.keys(a).sort().join(",");
  return x.length > 0 && x === Object.keys(b).sort().join(",");
}

/** The cases as they are now (a previous try may have corrected one). */
async function currentCases(projectId: string, ids: string[], fallback: EvalCase[]): Promise<EvalCase[]> {
  const ctx = await loadBuild(projectId);
  const dataset = await fs.readFile(path.join(ctx.dir, "evals", "dataset.json"), "utf8").then((t) => JSON.parse(t) as Dataset).catch(() => null);
  const found = (dataset?.cases ?? []).filter((c) => ids.includes(c.id));
  return found.length ? found : fallback;
}
