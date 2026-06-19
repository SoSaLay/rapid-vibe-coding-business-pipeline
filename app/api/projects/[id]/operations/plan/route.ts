import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, getProject } from "@/lib/store";
import { generateOpsReport, writeOpsGuide } from "@/lib/phases/operations";
import { StackChoice } from "@/lib/stack";

/** Generate the ops report: tool-grouped recurring checklist + release/incident runbooks. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const deploy = await latestArtifact(params.id, "deploy-manifest");
  if (!deploy) {
    return NextResponse.json(
      { error: "No deployment yet — complete Deployment first." },
      { status: 400 }
    );
  }
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";
  const ideaType = (project as any)?.idea_type as string | undefined;

  const spec = ((await latestArtifact(params.id, "product-spec"))?.payload as Record<string, any>) ?? null;
  const stack = ((await latestArtifact(params.id, "stack-selection"))?.payload as Record<string, any>) ?? null;
  const stackChoices = (stack?.choices as StackChoice[]) ?? null;

  const deployPayload = deploy.payload as Record<string, any>;
  const envs: any[] = deployPayload.environments || [];
  const prod = envs.find((e: any) => e.name === "prod");
  const prodUrl = prod?.url
    ? String(prod.url).startsWith("http") ? prod.url : `https://${prod.url}`
    : "(pending)";

  try {
    const report = await generateOpsReport(deployPayload, spec, stackChoices, ideaType);

    // Write OPS-GUIDE.md to the app workspace if it exists
    try {
      await writeOpsGuide(title, report, prodUrl);
    } catch {
      // workspace may not exist yet (no live build) — non-fatal
    }

    const prior = (await getPhaseState<any>(params.id, "operations")) ?? {};
    // A regenerated report gets fresh check ids — old timestamps no longer apply.
    await savePhaseState(params.id, "operations", {
      ...prior,
      report,
      prod_url: prodUrl,
      checkLog: {},
    });
    return NextResponse.json({ report, prod_url: prodUrl }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate the ops report." },
      { status: 500 }
    );
  }
}
