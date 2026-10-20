/** "Fix all issues" in Engineering: what it would take on right now. */

import { getPhaseState } from "../store";
import { loadBuild } from "./build-context";
import { getEvals } from "./evals-state";
import type { FixTarget } from "./fix";
import type { EvalFixTarget } from "./eval-fix";
import type { SecurityReport } from "../phases/agent-security";

/** What "Fix all issues" would take on right now: red safety items, failing example tasks, the latest evaluation failures. */
export async function fixAllTargets(projectId: string) {
  const report = (await getPhaseState<{ report?: SecurityReport }>(projectId, "security"))?.report;
  const safety: FixTarget[] = report
    ? [
        ...report.checks.filter((c) => c.status === "fail").map((c) => ({ kind: "check" as const, id: c.id })),
        ...report.threat_model.entry_points.map((e, i) => ({ e, i })).filter(({ e }) => !e.mitigated).map(({ i }) => ({ kind: "threat" as const, index: i })),
      ]
    : [];
  const ctx = await loadBuild(projectId);
  const examples = (ctx.build?.tests?.examples ?? []).filter((e) => !e.passed);
  const evals = await getEvals(projectId);
  const last = evals.runs[evals.runs.length - 1];
  const evalTargets: EvalFixTarget[] =
    last && (evals.dataset_version ?? 1) === last.summary.dataset_version
      ? [
          ...Object.entries(last.summary.categories)
            .filter(([k, r]) => r.rate < 1 && !evals.fixes?.[`cat:${k}`])
            .map(([k]) => ({ kind: "category" as const, category: k })),
          ...last.gate.map((g, i) => ({ g, i })).filter(({ g, i }) => !g.ok && i > 0 && !evals.fixes?.[`gate:${i}`]).map(({ i }) => ({ kind: "gate" as const, index: i })),
        ]
      : [];
  return { safety, examples, evalTargets, total: safety.length + (examples.length ? 1 : 0) + evalTargets.length };
}

