import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, saveArtifact, completePhase, getProject } from "@/lib/store";
import { parseTasksMd, generateLaunchGuide } from "@/lib/phases/engineering";
import { readWorkspaceFile, recentCommits, workspacePath } from "@/lib/workspace";

/** Finish the build: verify tasks, capture the Launch Guide → build-manifest, complete the phase. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "engineering");
  if (!state?.workspace) return NextResponse.json({ error: "No workspace — scaffold first." }, { status: 400 });
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";
  const body = await req.json().catch(() => ({}));

  const tasksMd = await readWorkspaceFile(title, "TASKS.md");
  const progress = tasksMd ? parseTasksMd(tasksMd) : null;
  if (!progress || progress.total === 0) {
    return NextResponse.json({ error: "TASKS.md not found in the workspace." }, { status: 400 });
  }
  if (progress.done < progress.total && !body.force) {
    return NextResponse.json(
      { error: `Build incomplete: ${progress.done}/${progress.total} tasks done. Pass force to complete anyway.`, progress },
      { status: 400 }
    );
  }

  try {
    let launchGuide = await readWorkspaceFile(title, "LAUNCH-GUIDE.md");
    if (!launchGuide) {
      launchGuide = await generateLaunchGuide(title, state.stack || [], state.taskGraph || null);
    }
    const commits = await recentCommits(title, 10);
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "engineering",
      artifactType: "build-manifest",
      payload: {
        workspace_path: workspacePath(title),
        stack: state.stack || [],
        tasks_done: progress.done,
        tasks_total: progress.total,
        forced: !!body.force && progress.done < progress.total,
        launch_guide: launchGuide,
        recent_commits: commits,
      },
      inputs: ["stack-selection", "task-graph"],
      status: "complete",
    });
    const updated = await completePhase(params.id, "engineering");
    return NextResponse.json({ artifact, project: updated }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to complete the build." }, { status: 500 });
  }
}
