import { NextRequest, NextResponse } from "next/server";
import { getProject, getPhaseState } from "@/lib/store";
import {
  parseDeployResults,
  verifyEnvironments,
  evaluateDeployExit,
  DEPLOY_RESULTS_PATH,
} from "@/lib/phases/deployment";
import { readWorkspaceFile, recentCommits, workspaceExists } from "@/lib/workspace";

/** Live deploy progress: parse deploy/results.json + commits; verify live URLs once the agent reports done. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const state = await getPhaseState<any>(params.id, "deployment");
  if (!state?.plan) return NextResponse.json({ error: "No deploy plan yet — generate it first." }, { status: 404 });
  const title = project.title;
  if (!(await workspaceExists(title))) {
    return NextResponse.json({ error: "App workspace not found on disk." }, { status: 404 });
  }

  const raw = await readWorkspaceFile(title, DEPLOY_RESULTS_PATH);
  const results = raw ? parseDeployResults(raw) : null;
  const commits = await recentCommits(title, 5);
  // Only hit the live URLs once the agent says it's done — keeps polling cheap during the run.
  const verifications = results?.completed_at ? await verifyEnvironments(results.environments) : [];
  const exit = evaluateDeployExit(results, verifications);

  return NextResponse.json({ results, commits, verifications, exit });
}
