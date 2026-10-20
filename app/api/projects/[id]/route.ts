import { NextRequest, NextResponse } from "next/server";
import { getProject, listArtifacts, getPhaseState, deleteProject } from "@/lib/store";
import { getAutoflow, isAutoflowRunning } from "@/lib/agent/autoflow";
import { activities } from "@/lib/agent/activity";
import { githubStatus } from "@/lib/agent/github";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  // Everything is read side by side: these are independent files (and a few git commands for agents).
  const phases = ["product-owner", "idea-validation", "pre-marketing", "product-design", "engineering", "qa", "deployment",
    "marketing-sales", "operations", "iteration", "agent-design", "security"] as const;
  const isAgent = project.kind === "agent";
  const [artifacts, states, flow, github] = await Promise.all([
    listArtifacts(params.id),
    Promise.all(phases.map((ph) => getPhaseState<any>(params.id, ph))),
    isAgent ? getAutoflow(params.id) : null,
    isAgent ? githubStatus(params.id).catch(() => null) : null,
  ]);
  const [productOwner, ideaValidation, preMarketing, productDesign, engineering, qa, deployment, marketing, operations, iteration, agentDesign, security] = states;
  // Agents: the background flow after a design change, and what's not on GitHub yet.
  const autoflow = flow ? { ...flow, running: isAutoflowRunning(params.id) } : null;
  return NextResponse.json({
    project,
    artifacts,
    phaseState: {
      "product-owner": productOwner,
      "idea-validation": ideaValidation,
      "pre-marketing": preMarketing,
      "product-design": productDesign,
      engineering,
      qa,
      deployment,
      "marketing-sales": marketing,
      operations,
      iteration,
      "agent-design": agentDesign,
      security,
      autoflow,
      github,
      // Long jobs running right now (evaluations, test cases, checks, builds, fixes), by stage.
      activity: activities(params.id),
    },
  });
}

/**
 * PERMANENTLY delete a project. Two-factor by design: the caller must echo the
 * project's exact title in the body (`{ confirmTitle }`) — a mismatch is rejected,
 * so a stray click can't wipe an idea.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const confirmTitle = typeof body.confirmTitle === "string" ? body.confirmTitle.trim() : "";
  if (confirmTitle !== project.title.trim()) {
    return NextResponse.json(
      { error: "Confirmation text does not match the idea's name." },
      { status: 400 }
    );
  }

  const ok = await deleteProject(params.id);
  if (!ok) return NextResponse.json({ error: "Could not delete the project." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
