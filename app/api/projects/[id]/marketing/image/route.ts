import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState, getProject, latestArtifact, getProjectSettings } from "@/lib/store";
import { geminiGenerateImage } from "@/lib/google/genai";
import { buildCampaignImagePrompt, saveAsset, latestAsset, readAssetBase64 } from "@/lib/brand-assets";
import { directionToPromptFragment } from "@/lib/brand-direction";

const SEED_COUNT = 3; // how many posts to auto-seed images for

/**
 * Generate a campaign image for one post (body { postId }) or auto-seed the
 * first few image-less posts (body { seed: true }). Nano Banana, brand-grounded;
 * reuses the logo as a reference so campaign art stays on-brand.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const state = await getPhaseState<any>(params.id, "marketing-sales");
  const posts: any[] = state?.posts || [];
  if (!posts.length) return NextResponse.json({ error: "Generate a content batch first." }, { status: 400 });

  const postAssets: Record<string, any> = { ...(state.postAssets || {}) };
  const targets: any[] = body.seed
    ? posts.filter((p) => !postAssets[p.id]?.image).slice(0, SEED_COUNT)
    : posts.filter((p) => p.id === body.postId);
  if (!targets.length) return NextResponse.json({ postAssets });

  const project = await getProject(params.id);
  const productName = project?.title || "Our product";
  const designSpec = ((await latestArtifact(params.id, "design-spec"))?.payload as Record<string, any>) ?? null;
  const direction = directionToPromptFragment((await getProjectSettings(params.id)).brandDirection);
  const logo = await latestAsset(params.id, "logo");
  const ref = logo ? await readAssetBase64(params.id, logo.file) : null;
  const refImages = ref ? [{ base64: ref.base64, mimeType: ref.mime }] : undefined;

  try {
    for (const p of targets) {
      const prompt = buildCampaignImagePrompt({
        post: { hook: p.hook, pillar: p.pillar, channel: p.channel },
        productName,
        branding: designSpec?.branding,
        visual: designSpec?.visual,
        direction,
      });
      const img = await geminiGenerateImage({ prompt, refImages, aspectRatio: "1:1" });
      const asset = await saveAsset({
        projectId: params.id,
        kind: "campaign-image",
        base64: img.base64,
        mime: img.mimeType,
        prompt,
        engine: "nano-banana",
        phase: "marketing-sales",
      });
      postAssets[p.id] = { ...(postAssets[p.id] || {}), image: { file: asset.file, at: asset.createdAt } };
    }
    await savePhaseState(params.id, "marketing-sales", { ...state, postAssets });
    return NextResponse.json({ postAssets });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate image." }, { status: 500 });
  }
}
