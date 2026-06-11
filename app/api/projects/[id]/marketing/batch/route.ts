import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, getProject } from "@/lib/store";
import { generateContentBatch, CampaignContext, ContentPost } from "@/lib/phases/marketing";

/** Stage 2: write the next 14 days of ready-to-post content (appends to the existing schedule). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "marketing-sales");
  if (!state?.plan) return NextResponse.json({ error: "No campaign plan yet — generate it first." }, { status: 400 });
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec found." }, { status: 400 });
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";

  const deployPayload = ((await latestArtifact(params.id, "deploy-manifest"))?.payload as Record<string, any>) ?? {};
  const prod = (deployPayload.environments || []).find((e: any) => e.name === "prod");
  const designSpec = ((await latestArtifact(params.id, "design-spec"))?.payload as Record<string, any>) ?? null;
  const preMkt = await getPhaseState<any>(params.id, "pre-marketing");
  const audienceBrief = ((await latestArtifact(params.id, "audience-brief"))?.payload as Record<string, any>) ?? null;

  const ctx: CampaignContext = {
    spec: specArtifact.payload as Record<string, any>,
    productTitle: title,
    prodUrl: prod?.url ? (String(prod.url).startsWith("http") ? prod.url : `https://${prod.url}`) : "(URL pending)",
    audienceBrief,
    marketReport: null, // craft pass doesn't need the research bulk — plan already encodes it
    positioning: preMkt?.kit?.positioning ?? null,
    contentLibrary: null,
    branding: designSpec?.branding ?? null,
    hasWaitlist: !!audienceBrief,
  };

  const existing: ContentPost[] = state.posts ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = existing.length ? existing.map((p) => p.date).sort().slice(-1)[0] : null;
  let startDate = today;
  if (lastDate && lastDate >= today) {
    const d = new Date(lastDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    startDate = d.toISOString().slice(0, 10);
  }

  try {
    const posts = await generateContentBatch({
      plan: state.plan,
      ctx,
      startDate,
      recentHooks: existing.map((p) => p.hook),
    });
    // Guard against id collisions with prior batches.
    const known = new Set(existing.map((p) => p.id));
    const fresh = posts.filter((p) => !known.has(p.id));
    const merged = [...existing, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
    await savePhaseState(params.id, "marketing-sales", { ...state, posts: merged });
    return NextResponse.json({ added: fresh.length, posts: merged }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate the content batch." }, { status: 500 });
  }
}
