import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, saveArtifact, completePhase } from "@/lib/store";

/** Approve the design: persist the design-spec artifact and complete the phase. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "product-design");
  if (!state?.brief) return NextResponse.json({ error: "Generate the design brief first." }, { status: 400 });

  try {
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "product-design",
      artifactType: "design-spec",
      payload: {
        ...state.brief,
        design_direction: state.direction ?? null,
        mockup_screens: Object.keys(state.mockups || {}),
      },
      inputs: ["product-spec", "market-report"],
      status: "complete",
    });
    const project = await completePhase(params.id, "product-design");
    return NextResponse.json({ artifact, project }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to approve design." }, { status: 500 });
  }
}
