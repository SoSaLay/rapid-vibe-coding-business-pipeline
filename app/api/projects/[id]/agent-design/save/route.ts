import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState } from "@/lib/store";
import type { AgentDesign } from "@/lib/agent/design";

/** Save the user's edits to the draft design. Editing an approved design reopens it for approval. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const design = body?.design as AgentDesign | undefined;
  if (!design || !Array.isArray(design.tools) || !design.model?.selected) {
    return NextResponse.json({ error: "Invalid design." }, { status: 400 });
  }
  const prev = (await getPhaseState<any>(params.id, "agent-design")) ?? {};
  const state = { ...prev, design, approved: false };
  await savePhaseState(params.id, "agent-design", state);
  return NextResponse.json(state);
}
