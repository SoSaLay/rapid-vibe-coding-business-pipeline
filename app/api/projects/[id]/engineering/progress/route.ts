import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { parseTasksMd } from "@/lib/phases/engineering";
import { readWorkspaceFile, recentCommits, detectGsd, workspaceExists } from "@/lib/workspace";

/** Live build progress: parse the workspace's TASKS.md + recent commits (+ GSD detection). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const title = project.title;

  if (!(await workspaceExists(title))) {
    return NextResponse.json({ error: "No workspace yet — scaffold it first." }, { status: 404 });
  }
  const tasksMd = await readWorkspaceFile(title, "TASKS.md");
  const progress = tasksMd ? parseTasksMd(tasksMd) : { total: 0, done: 0, current: null, milestones: [] };
  const commits = await recentCommits(title, 5);
  const gsd = await detectGsd(title);
  const launchGuideReady = (await readWorkspaceFile(title, "LAUNCH-GUIDE.md")) !== null;

  return NextResponse.json({ progress, commits, gsd, launchGuideReady });
}
