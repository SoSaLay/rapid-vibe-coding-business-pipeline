import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, getProject } from "@/lib/store";
import { generateCampaignPlan, CampaignContext } from "@/lib/phases/marketing";

/** Stage 1: generate the campaign plan (channels, pillars, rhythm, launch checklist, waitlist email). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const deploy = await latestArtifact(params.id, "deploy-manifest");
  if (!deploy) return NextResponse.json({ error: "No deployment yet — complete Deployment first." }, { status: 400 });
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec found." }, { status: 400 });
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";

  const deployPayload = deploy.payload as Record<string, any>;
  const prod = (deployPayload.environments || []).find((e: any) => e.name === "prod");
  const prodUrl = prod?.url ? (String(prod.url).startsWith("http") ? prod.url : `https://${prod.url}`) : "(URL pending)";

  const audienceBrief = ((await latestArtifact(params.id, "audience-brief"))?.payload as Record<string, any>) ?? null;
  const marketReport = ((await latestArtifact(params.id, "market-report"))?.payload as Record<string, any>) ?? null;
  const designSpec = ((await latestArtifact(params.id, "design-spec"))?.payload as Record<string, any>) ?? null;
  const preMkt = await getPhaseState<any>(params.id, "pre-marketing");

  const ctx: CampaignContext = {
    spec: specArtifact.payload as Record<string, any>,
    productTitle: title,
    prodUrl,
    audienceBrief,
    marketReport,
    positioning: preMkt?.kit?.positioning ?? null,
    contentLibrary: preMkt?.kit?.content_library ?? null,
    branding: designSpec?.branding ?? null,
    hasWaitlist: !!audienceBrief,
  };

  try {
    const plan = await generateCampaignPlan(ctx);
    const prior = (await getPhaseState<any>(params.id, "marketing-sales")) ?? {};
    await savePhaseState(params.id, "marketing-sales", {
      ...prior,
      plan,
      posts: prior.posts ?? [],
      postedIds: prior.postedIds ?? [],
      checklistDone: prior.checklistDone ?? [],
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate the campaign plan." }, { status: 500 });
  }
}
