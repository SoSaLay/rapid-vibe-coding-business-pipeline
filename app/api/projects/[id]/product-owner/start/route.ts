import { NextRequest, NextResponse } from "next/server";
import { ideaTypeContext } from "@/lib/idea-types";
import { latestArtifact, savePhaseState, getPhaseState, getProject } from "@/lib/store";
import { generatePOTurn, selectFrameworks, PODialogue } from "@/lib/phases/product-owner";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const existing = await getPhaseState<PODialogue>(params.id, "product-owner");
  if (existing && existing.turns.length > 0) return NextResponse.json({ dialogue: existing });

  const rawIdea = await latestArtifact(params.id, "raw-idea");
  if (!rawIdea) return NextResponse.json({ error: "No raw idea to review." }, { status: 400 });
  let ideaText = `${ideaTypeContext((rawIdea.payload as any)?.idea_type)}\n\n${(rawIdea.payload as any)?.raw_text || ""}`;

  // Cycle ≥2: the iteration brief is the real input — the dialogue refines a LIVE product.
  const project = await getProject(params.id);
  if ((project?.cycle ?? 1) > 1) {
    const iterationBrief = await latestArtifact(params.id, "iteration-brief");
    const handoff = (iterationBrief?.payload as any)?.po_handoff;
    if (handoff) ideaText = `${ideaText}\n\n---\n\n${handoff}`;
  }

  try {
    // The PO picks the playbooks that fit this idea (option 1: auto-select).
    const frameworks = await selectFrameworks(ideaText);
    const turn = await generatePOTurn(ideaText, [], frameworks.ids);
    const dialogue: PODialogue = {
      turns: [{ role: "po", assessment: turn.assessment, questions: turn.questions }],
      ready: turn.ready,
      round: 1,
      frameworks,
    };
    await savePhaseState(params.id, "product-owner", dialogue);
    return NextResponse.json({ dialogue });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Product Owner failed to start." }, { status: 500 });
  }
}
