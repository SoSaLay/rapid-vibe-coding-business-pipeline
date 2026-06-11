import { NextRequest, NextResponse } from "next/server";
import { getProject, getPhaseState } from "@/lib/store";
import { parseQaResults, evaluateExit, QA_RESULTS_PATH, QaPlan, ManualResponse } from "@/lib/phases/qa";
import { readWorkspaceFile, recentCommits, workspaceExists } from "@/lib/workspace";

/** Live QA progress: parse the workspace's qa/results.json + recent commits + the sign-off evaluation. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const state = await getPhaseState<{ plan?: QaPlan; manual?: ManualResponse[] }>(params.id, "qa");
  if (!state?.plan) return NextResponse.json({ error: "No QA plan yet — generate it first." }, { status: 404 });
  const title = project.title;
  if (!(await workspaceExists(title))) {
    return NextResponse.json({ error: "App workspace not found on disk." }, { status: 404 });
  }

  const raw = await readWorkspaceFile(title, QA_RESULTS_PATH);
  const results = raw ? parseQaResults(raw) : null;
  const commits = await recentCommits(title, 5);
  const resultsMdReady = (await readWorkspaceFile(title, "QA-RESULTS.md")) !== null;
  const exit = evaluateExit(state.plan, results, state.manual ?? []);

  return NextResponse.json({ results, commits, resultsMdReady, exit });
}
