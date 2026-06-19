import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, saveArtifact, getProject } from "@/lib/store";
import {
  generateTaskGraph,
  generateIterationTaskGraph,
  renderIterationMilestones,
  renderClaudeMd,
  renderTasksMd,
} from "@/lib/phases/engineering";
import {
  createWorkspace,
  workspaceExists,
  workspacePath,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "@/lib/workspace";

/**
 * Stage 2: generate the task graph and write the briefing into the app workspace.
 *
 * Cycle 1 (greenfield): create the workspace + full briefing package.
 * Cycle ≥2 with an existing workspace (iteration): NEVER re-scaffold — append an
 * IT<cycle> milestone to the existing TASKS.md (the build history and checked
 * boxes are preserved) and refresh the SPECS/ files to the latest spec versions.
 */
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
  const cycle = project?.cycle ?? 1;

  try {
    // ---- Iteration mode: build on top of the existing app ----
    if (cycle > 1 && (await workspaceExists(title))) {
      const currentTasksMd = (await readWorkspaceFile(title, "TASKS.md")) ?? "";
      const iterationBrief =
        ((await latestArtifact(params.id, "iteration-brief"))?.payload as Record<string, any>) ?? null;

      const taskGraph = await generateIterationTaskGraph({
        spec,
        design,
        choices: state.stack,
        productTitle: title,
        cycle,
        iterationBrief,
        currentTasksMd,
      });

      await writeWorkspaceFile(
        title,
        "TASKS.md",
        currentTasksMd.trimEnd() + "\n" + renderIterationMilestones(taskGraph)
      );
      // The agent reads SPECS/ as the source of truth — keep them at the latest versions.
      await writeWorkspaceFile(title, "SPECS/product-spec.json", JSON.stringify(spec, null, 2));
      if (design) await writeWorkspaceFile(title, "SPECS/design-spec.json", JSON.stringify(design, null, 2));

      const dir = workspacePath(title);
      const workspace = { path: dir, startCommand: `cd "${dir}" && claude`, gitInitialized: true };
      const artifact = await saveArtifact({
        projectId: params.id,
        phase: "engineering",
        artifactType: "task-graph",
        payload: { ...taskGraph, workspace_path: dir, iteration_cycle: cycle },
        inputs: ["product-spec", "design-spec", "iteration-brief"],
        status: "complete",
      });
      await savePhaseState(params.id, "engineering", { ...state, taskGraph, workspace, iterationCycle: cycle });
      return NextResponse.json({ artifact, workspace, taskGraph, mode: "iteration" }, { status: 201 });
    }

    // ---- Greenfield: first build of this app ----
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
    return NextResponse.json({ artifact, workspace, taskGraph, mode: "greenfield" }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to scaffold workspace." }, { status: 500 });
  }
}
