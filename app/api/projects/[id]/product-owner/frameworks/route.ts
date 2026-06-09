import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState } from "@/lib/store";
import { PODialogue } from "@/lib/phases/product-owner";

/** Override which playbooks the Product Owner uses for this idea. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

  const dialogue = (await getPhaseState<PODialogue>(params.id, "product-owner")) ?? {
    turns: [],
    ready: false,
    round: 0,
  };
  dialogue.frameworks = { ids, rationale: "Manually selected." };
  await savePhaseState(params.id, "product-owner", dialogue);
  return NextResponse.json({ frameworks: dialogue.frameworks });
}
