import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, savePhaseState, getPhaseState, saveArtifact, completePhase } from "@/lib/store";
import { synthesizeSpec, PODialogue } from "@/lib/phases/product-owner";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const dialogue = await getPhaseState<PODialogue>(params.id, "product-owner");
  const rawIdea = await latestArtifact(params.id, "raw-idea");
  if (!rawIdea) return NextResponse.json({ error: "No raw idea found." }, { status: 400 });
  const ideaText = (rawIdea.payload as any)?.raw_text || "";

  try {
    const frameworkIds = dialogue?.frameworks?.ids ?? [];
    const spec = await synthesizeSpec(ideaText, dialogue?.turns ?? [], frameworkIds);
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "product-owner",
      artifactType: "product-spec",
      payload: { ...spec, frameworks_applied: frameworkIds },
      inputs: [`raw-idea@${rawIdea.version}`],
    });
    const project = await completePhase(params.id, "product-owner");

    if (dialogue) {
      dialogue.ready = true;
      await savePhaseState(params.id, "product-owner", dialogue);
    }
    return NextResponse.json({ artifact, project }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to synthesize spec." }, { status: 500 });
  }
}
