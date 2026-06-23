import { NextRequest, NextResponse } from "next/server";
import { ideaTypeContext } from "@/lib/idea-types";
import { latestArtifact, savePhaseState, getPhaseState, saveArtifact, completePhase } from "@/lib/store";
import { synthesizeSpec, PODialogue } from "@/lib/phases/product-owner";
import { interjectionContext } from "@/lib/interjections";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const dialogue = await getPhaseState<PODialogue>(params.id, "product-owner");
  const rawIdea = await latestArtifact(params.id, "raw-idea");
  if (!rawIdea) return NextResponse.json({ error: "No raw idea found." }, { status: 400 });
  const ideaText = `${ideaTypeContext((rawIdea.payload as any)?.idea_type)}\n\n${(rawIdea.payload as any)?.raw_text || ""}`;

  try {
    const frameworkIds = dialogue?.frameworks?.ids ?? [];
    const extra = await interjectionContext(params.id, "product-owner");
    const spec = await synthesizeSpec(ideaText, dialogue?.turns ?? [], frameworkIds, extra);
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "product-owner",
      artifactType: "product-spec",
      // Stamp the idea type into the spec so every downstream phase inherits it.
      payload: { ...spec, idea_type: (rawIdea.payload as any)?.idea_type || "web-app", frameworks_applied: frameworkIds },
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
