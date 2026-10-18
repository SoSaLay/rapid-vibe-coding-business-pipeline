import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, getProject, getProjectSettings } from "@/lib/store";
import { selectDesignDirection, generateDesignBrief } from "@/lib/phases/product-design";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec found." }, { status: 400 });
  const spec = specArtifact.payload as Record<string, any>;
  const marketArtifact = await latestArtifact(params.id, "market-report");
  const market = (marketArtifact?.payload as Record<string, any>) ?? null;
  const preMkt = await getPhaseState<any>(params.id, "pre-marketing");
  const kit = preMkt?.kit ?? null;
  const project = await getProject(params.id);
  const brandDirection = (await getProjectSettings(params.id)).brandDirection ?? null;

  try {
    const context =
      `Product: ${project?.title || ""}\nProblem: ${spec.problem_statement || spec.summary || ""}\n` +
      `Users: ${(spec.target_users || []).join(", ")}`;
    const direction = await selectDesignDirection(context);
    const brief = await generateDesignBrief(spec, market, kit, direction.system_ids, project?.title || "Untitled", brandDirection);
    // Regenerating the brief invalidates old mockups — their tokens are stale.
    await savePhaseState(params.id, "product-design", { direction, brief, mockups: {} });
    return NextResponse.json({ brief, direction });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate design brief." }, { status: 500 });
  }
}
