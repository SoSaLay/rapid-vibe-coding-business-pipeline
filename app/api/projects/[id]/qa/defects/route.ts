import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState, getProject } from "@/lib/store";
import { renderFixRound, Defect } from "@/lib/phases/qa";
import { readWorkspaceFile, writeWorkspaceFile, workspaceExists } from "@/lib/workspace";

/** Defect loop: append a fix-round milestone to the workspace TASKS.md for the builder agent. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "qa");
  if (!state?.plan) return NextResponse.json({ error: "No QA plan yet — generate it first." }, { status: 400 });
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";
  if (!(await workspaceExists(title))) {
    return NextResponse.json({ error: "App workspace not found on disk." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const defects: Defect[] = Array.isArray(body.defects)
    ? body.defects
        .filter((d: any) => d && typeof d.id === "string" && typeof d.title === "string" && d.title.trim())
        .map((d: any) => ({ id: d.id, title: d.title.trim(), notes: d.notes ? String(d.notes) : undefined }))
    : [];
  if (!defects.length) return NextResponse.json({ error: "No defects provided." }, { status: 400 });

  const tasksMd = await readWorkspaceFile(title, "TASKS.md");
  if (!tasksMd) return NextResponse.json({ error: "TASKS.md not found in the workspace." }, { status: 400 });

  const round = (state.fixRound ?? 0) + 1;
  await writeWorkspaceFile(title, "TASKS.md", tasksMd.trimEnd() + "\n" + renderFixRound(round, defects));
  await savePhaseState(params.id, "qa", { ...state, fixRound: round });

  return NextResponse.json({
    round,
    appended: defects.length,
    next: "Re-run the build command so the agent works the fix round, then re-run the QA pass.",
  });
}
