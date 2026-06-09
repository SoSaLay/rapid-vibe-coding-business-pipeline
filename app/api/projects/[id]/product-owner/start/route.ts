import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, savePhaseState, getPhaseState } from "@/lib/store";
import { generatePOTurn, selectFrameworks, PODialogue } from "@/lib/phases/product-owner";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const existing = await getPhaseState<PODialogue>(params.id, "product-owner");
  if (existing && existing.turns.length > 0) return NextResponse.json({ dialogue: existing });

  const rawIdea = await latestArtifact(params.id, "raw-idea");
  if (!rawIdea) return NextResponse.json({ error: "No raw idea to review." }, { status: 400 });
  const ideaText = (rawIdea.payload as any)?.raw_text || "";

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
