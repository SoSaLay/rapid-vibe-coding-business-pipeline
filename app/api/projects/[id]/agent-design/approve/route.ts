import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { getPhaseState, savePhaseState, saveArtifact, completePhase, getProject } from "@/lib/store";
import { designBlockers, type AgentDesign } from "@/lib/agent/design";
import { startAutoflow } from "@/lib/agent/autoflow";

/** Lock the design. Engineering builds only the approved version. */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<{ design: AgentDesign; spec_version?: number }>(params.id, "agent-design");
  if (!state?.design) return NextResponse.json({ error: "Generate the design first." }, { status: 400 });
  const blockers = designBlockers(state.design);
  if (blockers.length) return NextResponse.json({ error: "Fix these before approving.", blockers }, { status: 400 });

  const artifact = await saveArtifact({
    projectId: params.id,
    phase: "agent-design",
    artifactType: "agent-design",
    payload: { ...state.design, approved_at: new Date().toISOString() },
    inputs: state.spec_version ? [`product-spec@${state.spec_version}`] : ["product-spec"],
  });
  const meta = await getProject(params.id);
  // Re-approving after an edit must not re-lock stages that already moved on.
  const project = meta?.phase_status["agent-design"] === "complete" ? meta : await completePhase(params.id, "agent-design");
  await savePhaseState(params.id, "agent-design", { ...state, approved: true, approved_version: artifact.version });
  // Already built: carry the change through Engineering (and Deployment, if pushing is automatic) on its own.
  const built = (await getPhaseState<any>(params.id, "engineering"))?.agentBuild;
  const autoflow = !!built && built.design_version !== artifact.version;
  if (autoflow) startAutoflow(params.id, req.nextUrl.origin, artifact.version);
  return NextResponse.json({ artifact, project, autoflow }, { status: 201 });
}

export const POST = attributed(handlePost);
