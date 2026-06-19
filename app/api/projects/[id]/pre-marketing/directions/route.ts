import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState, getProject, latestArtifact, getProjectSettings, saveProjectSettings } from "@/lib/store";
import { proposeBrandDirections } from "@/lib/brand-direction";

/** Current direction options (from phase-state) + the selected one (from settings). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "pre-marketing");
  const settings = await getProjectSettings(params.id);
  return NextResponse.json({ options: state?.directionOptions || [], selected: settings.brandDirection || null });
}

function specToText(spec: Record<string, any> | undefined): string {
  if (!spec) return "";
  const f = (a: any[]) => (Array.isArray(a) ? a.join("; ") : "");
  return [
    `Summary: ${spec.summary || ""}`,
    `Problem: ${spec.problem_statement || ""}`,
    `Target users: ${f(spec.target_users)}`,
    `Value: ${spec.value_proposition || ""}`,
  ].join("\n");
}

/**
 * POST { action: "propose" } → generate 3 directions (text only), store + return.
 * POST { action: "select", id } → lock the chosen direction project-wide.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const action = body.action || "propose";

  if (action === "select") {
    const state = await getPhaseState<any>(params.id, "pre-marketing");
    const chosen = (state?.directionOptions || []).find((d: any) => d.id === body.id);
    if (!chosen) return NextResponse.json({ error: "That direction is no longer available." }, { status: 400 });
    const settings = await saveProjectSettings(params.id, { brandDirection: chosen });
    return NextResponse.json({ selected: settings.brandDirection });
  }

  // propose
  const state = await getPhaseState<any>(params.id, "pre-marketing");
  if (!state?.kit) return NextResponse.json({ error: "Generate the validation kit first." }, { status: 400 });
  const project = await getProject(params.id);
  const spec = (await latestArtifact(params.id, "product-spec"))?.payload as Record<string, any> | undefined;
  const pos = state.kit.positioning || {};

  const context = [
    `PRODUCT: ${project?.title || "Our product"}`,
    specToText(spec),
    `POSITIONING:\nHeadline: ${pos.headline || ""}\nSubheadline: ${pos.subheadline || ""}\nProblem: ${pos.problem_statement || ""}`,
  ].join("\n\n");

  try {
    const options = await proposeBrandDirections(context);
    await savePhaseState(params.id, "pre-marketing", { ...state, directionOptions: options });
    return NextResponse.json({ options });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to propose directions." }, { status: 500 });
  }
}
