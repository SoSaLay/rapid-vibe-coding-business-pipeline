import { NextRequest, NextResponse } from "next/server";
import { saveArtifact, completePhase, getProject } from "@/lib/store";
import { getEvals } from "@/lib/agent/evals-state";

/**
 * Record the qa-report and unlock Deployment. The latest run must pass the gate;
 * otherwise the owner must write why they're overriding it (kept in the report).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const override = String(body.override ?? "").trim();
  const state = await getEvals(params.id);
  const last = state.runs[state.runs.length - 1];
  if (!last) return NextResponse.json({ error: "Run the evaluations first." }, { status: 400 });
  if (!last.passed && !override) return NextResponse.json({ error: "The gate failed. Fix it, or write why you're releasing anyway." }, { status: 400 });

  const artifact = await saveArtifact({
    projectId: params.id,
    phase: "qa",
    artifactType: "qa-report",
    payload: {
      kind: "agent-evals",
      dataset_version: last.summary.dataset_version,
      summary: last.summary,
      gate: last.gate,
      passed: last.passed,
      baseline: state.baseline,
      baseline_at: state.baseline_at,
      override: last.passed ? undefined : override,
      evaluated_at: last.at,
    },
    inputs: ["build-manifest", "security-report"],
  });
  const meta = await getProject(params.id);
  const project = meta?.phase_status.qa === "complete" ? meta : await completePhase(params.id, "qa");
  return NextResponse.json({ artifact, project }, { status: 201 });
}
