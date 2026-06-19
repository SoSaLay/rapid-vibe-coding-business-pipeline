import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState, getProject, latestArtifact, getProjectSettings } from "@/lib/store";
import { veoStartVideo, veoPollVideo, geminiFetchFileBase64 } from "@/lib/google/genai";
import { buildVideoPrompt, saveAsset } from "@/lib/brand-assets";
import { directionToPromptFragment } from "@/lib/brand-direction";

/**
 * Veo video, on-demand per post. POST { postId } starts a render and stores the
 * operation; GET ?postId polls it and, when done, downloads + saves the video.
 * Kept async (Veo takes minutes and costs real money) so the UI can poll.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const state = await getPhaseState<any>(params.id, "marketing-sales");
  const post = (state?.posts || []).find((p: any) => p.id === body.postId);
  if (!post) return NextResponse.json({ error: "Unknown post." }, { status: 400 });

  const project = await getProject(params.id);
  const designSpec = ((await latestArtifact(params.id, "design-spec"))?.payload as Record<string, any>) ?? null;
  const direction = directionToPromptFragment((await getProjectSettings(params.id)).brandDirection);
  const prompt = buildVideoPrompt({
    post: { hook: post.hook, body: post.body, channel: post.channel },
    productName: project?.title || "Our product",
    branding: designSpec?.branding,
    direction,
  });

  try {
    const op = await veoStartVideo({ prompt, aspectRatio: "9:16" });
    const videoOps = { ...(state.videoOps || {}), [post.id]: { op, status: "pending", startedAt: new Date().toISOString() } };
    await savePhaseState(params.id, "marketing-sales", { ...state, videoOps });
    return NextResponse.json({ status: "pending" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to start the video." }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const postId = req.nextUrl.searchParams.get("postId") || "";
  const state = await getPhaseState<any>(params.id, "marketing-sales");
  const opEntry = state?.videoOps?.[postId];
  if (!opEntry?.op) return NextResponse.json({ status: "none" });

  try {
    const result = await veoPollVideo(opEntry.op);
    if (!result.done) return NextResponse.json({ status: "pending" });

    const videoOps = { ...(state.videoOps || {}) };
    if (result.error || !result.uri) {
      delete videoOps[postId];
      await savePhaseState(params.id, "marketing-sales", { ...state, videoOps });
      return NextResponse.json({ status: "error", error: result.error || "No video produced." }, { status: 500 });
    }

    const file = await geminiFetchFileBase64(result.uri);
    const asset = await saveAsset({
      projectId: params.id,
      kind: "campaign-video",
      base64: file.base64,
      mime: file.mime,
      prompt: "",
      engine: "veo-3.1",
      phase: "marketing-sales",
    });
    delete videoOps[postId];
    const postAssets = { ...(state.postAssets || {}) };
    postAssets[postId] = { ...(postAssets[postId] || {}), video: { file: asset.file, at: asset.createdAt } };
    await savePhaseState(params.id, "marketing-sales", { ...state, videoOps, postAssets });
    return NextResponse.json({ status: "done", video: { file: asset.file } });
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e?.message || "Poll failed." }, { status: 500 });
  }
}
