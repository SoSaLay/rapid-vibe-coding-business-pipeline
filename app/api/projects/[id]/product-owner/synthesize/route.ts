import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import { latestArtifact, savePhaseState, getPhaseState, saveArtifact, completePhase, getProject } from "@/lib/store";
import { synthesizeSpec, PODialogue, ideaTextFor, withAgentBasics } from "@/lib/phases/product-owner";

async function handlePost(_req: NextRequest, { params }: { params: { id: string } }) {
  const dialogue = await getPhaseState<PODialogue>(params.id, "product-owner");
  const rawIdea = await latestArtifact(params.id, "raw-idea");
  if (!rawIdea) return NextResponse.json({ error: "No raw idea found." }, { status: 400 });
  const ideaText = ideaTextFor(rawIdea.payload);

  try {
    const frameworkIds = dialogue?.frameworks?.ids ?? [];
    const spec = withAgentBasics(
      await synthesizeSpec(ideaText, dialogue?.turns ?? [], frameworkIds, "", (await getProject(params.id))?.kind),
      rawIdea.payload
    );
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

export const POST = attributed(handlePost);
