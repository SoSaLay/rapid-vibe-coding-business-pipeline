import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState, getProjectSettings } from "@/lib/store";
import { geminiGenerateImage, GEMINI_IMAGE_PRO_MODEL } from "@/lib/google/genai";
import { buildLogoPrompt, saveAsset } from "@/lib/brand-assets";
import { directionToPromptFragment } from "@/lib/brand-direction";

/** Generate (or regenerate) the brand logo via Nano Banana, grounded in the design-spec brand. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "product-design");
  if (!state?.brief) return NextResponse.json({ error: "Generate the design brief first." }, { status: 400 });

  const branding = state.brief.branding || {};
  const visual = state.brief.visual || {};
  const direction = directionToPromptFragment((await getProjectSettings(params.id)).brandDirection);
  const prompt = buildLogoPrompt(branding, visual, direction);

  try {
    // Pro model for crisp wordmark text; square for header + app-icon duty.
    const img = await geminiGenerateImage({
      prompt,
      model: GEMINI_IMAGE_PRO_MODEL,
      aspectRatio: "1:1",
      imageSize: "2K",
    });
    const asset = await saveAsset({
      projectId: params.id,
      kind: "logo",
      base64: img.base64,
      mime: img.mimeType,
      prompt,
      engine: "nano-banana",
      phase: "product-design",
    });
    await savePhaseState(params.id, "product-design", { ...state, logo: { file: asset.file, at: asset.createdAt } });
    return NextResponse.json({ logo: { file: asset.file, at: asset.createdAt } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate logo." }, { status: 500 });
  }
}
