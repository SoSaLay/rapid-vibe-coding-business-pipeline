import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, saveArtifact, completePhase, getProject } from "@/lib/store";
import { securityPasses, type SecurityReport } from "@/lib/phases/agent-security";

/** Record the security-report and unlock Evaluations — only when nothing is left failing. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const report = (await getPhaseState<{ report?: SecurityReport }>(params.id, "security"))?.report;
  if (!report) return NextResponse.json({ error: "Run the security review first." }, { status: 400 });
  if (!securityPasses(report)) return NextResponse.json({ error: "Fix or sign off every failing check first." }, { status: 400 });
  const artifact = await saveArtifact({
    projectId: params.id,
    phase: "security",
    artifactType: "security-report",
    payload: report,
    inputs: ["agent-design", "build-manifest"],
  });
  const meta = await getProject(params.id);
  const project = meta?.phase_status.security === "complete" ? meta : await completePhase(params.id, "security");
  return NextResponse.json({ artifact, project }, { status: 201 });
}
