import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { runPreflight } from "@/lib/phases/deployment";
import { workspaceExists } from "@/lib/workspace";

/** Stage 2: auto-verified local prerequisites (AWS CLI, credentials, gh auth, workspace). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const checks = await runPreflight(await workspaceExists(project.title));
  return NextResponse.json({ checks, allOk: checks.every((c) => c.ok) });
}
