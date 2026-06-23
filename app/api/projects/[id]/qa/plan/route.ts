import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, getProject } from "@/lib/store";
import { generateQaPlan, renderQaPlanMd, QA_CHECKLIST_PATH } from "@/lib/phases/qa";
import { workspaceExists, writeWorkspaceFile } from "@/lib/workspace";
import { interjectionContext } from "@/lib/interjections";

/** Stage 1: generate the QA plan and write the briefing (QA-PLAN.md + qa/checklist.json) into the workspace. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const manifestArtifact = await latestArtifact(params.id, "build-manifest");
  if (!manifestArtifact) return NextResponse.json({ error: "No build yet — complete Engineering first." }, { status: 400 });
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec found." }, { status: 400 });
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";
  if (!(await workspaceExists(title))) {
    return NextResponse.json({ error: "App workspace not found on disk." }, { status: 400 });
  }

  const spec = specArtifact.payload as Record<string, any>;
  const design = ((await latestArtifact(params.id, "design-spec"))?.payload as Record<string, any>) ?? null;
  const manifest = manifestArtifact.payload as Record<string, any>;

  try {
    const plan = await generateQaPlan(spec, design, manifest, title, await interjectionContext(params.id, "qa"));
    await writeWorkspaceFile(title, "QA-PLAN.md", renderQaPlanMd(plan, title));
    await writeWorkspaceFile(title, QA_CHECKLIST_PATH, JSON.stringify(plan, null, 2));

    const prior = (await getPhaseState<any>(params.id, "qa")) ?? {};
    const startCommand = `cd "${manifest.workspace_path}" && claude "Open QA-PLAN.md and execute the full QA pass exactly as written."`;
    const state = { ...prior, plan, manual: prior.manual ?? [], fixRound: prior.fixRound ?? 0, startCommand };
    await savePhaseState(params.id, "qa", state);
    return NextResponse.json({ plan, startCommand }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate the QA plan." }, { status: 500 });
  }
}
