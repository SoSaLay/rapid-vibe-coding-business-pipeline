import { NextRequest, NextResponse } from "next/server";
import { ideaTypeContext } from "@/lib/idea-types";
import { latestArtifact, savePhaseState, getPhaseState } from "@/lib/store";
import { generatePOTurn, PODialogue } from "@/lib/phases/product-owner";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const text = (body.text || "").trim();
  if (!text) return NextResponse.json({ error: "Answer is empty." }, { status: 400 });

  const dialogue = await getPhaseState<PODialogue>(params.id, "product-owner");
  if (!dialogue) return NextResponse.json({ error: "No active review. Start it first." }, { status: 400 });

  const rawIdea = await latestArtifact(params.id, "raw-idea");
  const ideaText = `${ideaTypeContext((rawIdea?.payload as any)?.idea_type)}\n\n${(rawIdea?.payload as any)?.raw_text || ""}`;

  dialogue.turns.push({ role: "owner", text });

  try {
    const turn = await generatePOTurn(ideaText, dialogue.turns, dialogue.frameworks?.ids ?? []);
    dialogue.turns.push({ role: "po", assessment: turn.assessment, questions: turn.questions });
    dialogue.ready = turn.ready;
    dialogue.round += 1;
    await savePhaseState(params.id, "product-owner", dialogue);
    return NextResponse.json({ dialogue });
  } catch (e: any) {
    // Persist the owner's answer even if the PO turn fails, so it isn't lost.
    await savePhaseState(params.id, "product-owner", dialogue);
    return NextResponse.json({ error: e?.message || "Product Owner failed to respond." }, { status: 500 });
  }
}
