import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState, getProject, latestArtifact, getProjectSettings } from "@/lib/store";
import { geminiGenerateImage, GEMINI_IMAGE_MODEL, GEMINI_IMAGE_PRO_MODEL } from "@/lib/google/genai";
import {
  buildLogoPrompt,
  buildHeroPrompt,
  saveAsset,
  latestAsset,
  readAssetBase64,
  type AssetKind,
} from "@/lib/brand-assets";
import { directionToPromptFragment } from "@/lib/brand-direction";

type Ref = { base64: string; mimeType: string };

/** Current brand-asset refs for this project's pre-marketing phase. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "pre-marketing");
  return NextResponse.json({ assets: state?.assets || {} });
}

/**
 * Generate brand visuals via Nano Banana. Body: { kind: "logo"|"hero"|"og"|"all" } (default "all").
 * The logo is generated first and passed as a reference so hero/og stay on-brand.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "pre-marketing");
  if (!state?.kit) return NextResponse.json({ error: "Generate the validation kit first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const kind: string = body.kind || "all";
  const project = await getProject(params.id);
  const spec = (await latestArtifact(params.id, "product-spec"))?.payload as Record<string, any> | undefined;

  const pos = state.kit.positioning || {};
  const productName = project?.title || "Our product";
  const audience = Array.isArray(spec?.target_users) ? spec!.target_users.join(", ") : undefined;
  const direction = directionToPromptFragment((await getProjectSettings(params.id)).brandDirection);
  // Ground the image prompts in the real product, not just the name.
  const valueProp: string | undefined = spec?.value_proposition || pos.subheadline || undefined;
  const brandingCtx = { name: productName, value_proposition: valueProp, tagline: pos.headline };

  try {
    const assets: Record<string, { file: string; at: string }> = { ...(state.assets || {}) };

    async function logoRef(): Promise<Ref | undefined> {
      const a = await latestAsset(params.id, "logo");
      if (!a) return undefined;
      const data = await readAssetBase64(params.id, a.file);
      return data ? { base64: data.base64, mimeType: data.mime } : undefined;
    }

    async function gen(k: AssetKind) {
      if (k === "logo") {
        const prompt = buildLogoPrompt(brandingCtx, undefined, direction);
        const img = await geminiGenerateImage({ prompt, model: GEMINI_IMAGE_PRO_MODEL, aspectRatio: "1:1", imageSize: "2K" });
        const a = await saveAsset({ projectId: params.id, kind: "logo", base64: img.base64, mime: img.mimeType, prompt, engine: "nano-banana", phase: "pre-marketing" });
        assets.logo = { file: a.file, at: a.createdAt };
        return;
      }
      const forOg = k === "og";
      const prompt = buildHeroPrompt({ productName, headline: pos.headline, problem: pos.problem_statement, audience, valueProp, direction, forOg });
      const ref = await logoRef();
      const img = await geminiGenerateImage({
        prompt,
        model: forOg ? GEMINI_IMAGE_PRO_MODEL : GEMINI_IMAGE_MODEL, // og has headline text → Pro
        aspectRatio: "16:9",
        imageSize: "2K",
        refImages: ref ? [ref] : undefined,
      });
      const a = await saveAsset({ projectId: params.id, kind: k, base64: img.base64, mime: img.mimeType, prompt, engine: "nano-banana", phase: "pre-marketing" });
      assets[k] = { file: a.file, at: a.createdAt };
    }

    // Logo first so hero/og can reference it.
    const order: AssetKind[] = kind === "all" ? ["logo", "hero", "og"] : [kind as AssetKind];
    for (const k of order) await gen(k);

    await savePhaseState(params.id, "pre-marketing", { ...state, assets });
    return NextResponse.json({ assets });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate brand visuals." }, { status: 500 });
  }
}
