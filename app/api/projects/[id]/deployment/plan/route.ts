import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, getProject } from "@/lib/store";
import { generateDeployPlan } from "@/lib/phases/deployment";
import { getDeployTarget } from "@/lib/deploy/registry";
import { workspaceExists, writeWorkspaceFile, readWorkspaceFile, slugify } from "@/lib/workspace";

/** Stage 1: generate the deploy plan and write the runbook (DEPLOY-PLAN.md) into the workspace. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const qaReport = await latestArtifact(params.id, "qa-report");
  if (!qaReport) return NextResponse.json({ error: "No QA sign-off yet — complete QA first." }, { status: 400 });
  const manifestArtifact = await latestArtifact(params.id, "build-manifest");
  if (!manifestArtifact) return NextResponse.json({ error: "No build manifest found." }, { status: 400 });
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec found." }, { status: 400 });
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";
  if (!(await workspaceExists(title))) {
    return NextResponse.json({ error: "App workspace not found on disk." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const target = getDeployTarget(typeof body.target === "string" ? body.target : "amplify");
  if (!target) return NextResponse.json({ error: "Unknown deploy target." }, { status: 400 });
  if (target.status !== "active") {
    return NextResponse.json({ error: `${target.label} is coming soon — AWS Amplify is the wired target.` }, { status: 400 });
  }
  const options = {
    waf: !!body.waf,
    domain: typeof body.domain === "string" && body.domain.trim() ? body.domain.trim().toLowerCase() : null,
  };

  const spec = specArtifact.payload as Record<string, any>;
  const manifest = manifestArtifact.payload as Record<string, any>;
  const envExample = await readWorkspaceFile(title, ".env.example");

  try {
    const plan = await generateDeployPlan({
      spec,
      manifest,
      envExample,
      productTitle: title,
      waf: options.waf,
      domain: options.domain,
    });
    const slug = slugify(title);
    const runbook = target.renderRunbook({
      productTitle: title,
      slug,
      workspacePath: String(manifest.workspace_path || ""),
      options,
      envVars: plan.env_vars,
      stack: Array.isArray(manifest.stack) ? manifest.stack : [],
    });
    await writeWorkspaceFile(title, "DEPLOY-PLAN.md", runbook);

    const prior = (await getPhaseState<any>(params.id, "deployment")) ?? {};
    const startCommand = `cd "${manifest.workspace_path}" && claude "Open DEPLOY-PLAN.md and execute the deployment exactly as written."`;
    await savePhaseState(params.id, "deployment", { ...prior, plan, options, target: target.id, startCommand });
    return NextResponse.json({ plan, options, target: target.id, startCommand }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate the deploy plan." }, { status: 500 });
  }
}
