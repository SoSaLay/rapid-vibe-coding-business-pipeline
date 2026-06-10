import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, saveArtifact, getProject } from "@/lib/store";
import { generateTaskGraph, renderClaudeMd, renderTasksMd } from "@/lib/phases/engineering";
import { createWorkspace } from "@/lib/workspace";

/** Stage 2: generate the task graph and write the briefing package into the app's workspace folder. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "engineering");
  if (!state?.stack || !state?.proposal) {
    return NextResponse.json({ error: "Approve the tech stack first." }, { status: 400 });
  }
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec found." }, { status: 400 });
  const spec = specArtifact.payload as Record<string, any>;
  const design = ((await latestArtifact(params.id, "design-spec"))?.payload as Record<string, any>) ?? null;
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";

  try {
    const taskGraph = await generateTaskGraph(spec, design, state.stack, title);
    const claudeMd = renderClaudeMd({ productTitle: title, choices: state.stack, proposal: state.proposal, design });
    const tasksMd = renderTasksMd(taskGraph, title);
    const workspace = await createWorkspace(title, { claudeMd, tasksMd, productSpec: spec, designSpec: design });

    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "engineering",
      artifactType: "task-graph",
      payload: { ...taskGraph, workspace_path: workspace.path },
      inputs: ["product-spec", "design-spec"],
      status: "complete",
    });
    await savePhaseState(params.id, "engineering", { ...state, taskGraph, workspace });
    return NextResponse.json({ artifact, workspace, taskGraph }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to scaffold workspace." }, { status: 500 });
  }
}
