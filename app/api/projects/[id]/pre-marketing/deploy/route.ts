import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, getProject, savePhaseState } from "@/lib/store";
import { slugify } from "@/lib/workspace";
import { deployLandingToAmplify } from "@/lib/deploy/landing";
import { buildAndWriteLanding, landingDir } from "@/lib/phases/landing-build";

/** Report any prior deploy so the UI can show the live URL on load. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "pre-marketing");
  return NextResponse.json({ url: state?.landingDeployedUrl || null, appId: state?.landingAppId || null });
}

/** Deploy the generated landing page to AWS Amplify and bake the live URL in. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "pre-marketing");
  if (!state?.kit) return NextResponse.json({ error: "Generate the validation kit first." }, { status: 400 });
  const project = await getProject(params.id);
  const slug = slugify(project?.title || params.id);

  const result = await deployLandingToAmplify({
    slug,
    htmlDir: landingDir(params.id),
    existingAppId: state.landingAppId,
  });

  if (!result.ok) {
    // Still persist the appId if one got created, so re-deploys reuse it.
    if (result.appId && result.appId !== state.landingAppId) {
      await savePhaseState(params.id, "pre-marketing", { ...state, landingAppId: result.appId });
    }
    return NextResponse.json({ error: result.error, log: result.log }, { status: 502 });
  }

  // Persist the live URL + app id, then re-render so canonical/og:url are baked in.
  await savePhaseState(params.id, "pre-marketing", {
    ...state,
    landingAppId: result.appId,
    landingDeployedUrl: result.url,
  });
  try {
    await buildAndWriteLanding(params.id);
  } catch {
    // Non-fatal: the page is already live; the runtime canonical fallback still applies.
  }

  return NextResponse.json({ ok: true, url: result.url, appId: result.appId, log: result.log });
}
