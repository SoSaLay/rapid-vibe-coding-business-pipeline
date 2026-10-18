import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, savePhaseState, getProject } from "@/lib/store";
import { generateAgentDesign } from "@/lib/phases/agent-design";

/** Generate the recommended design (a draft the user edits before approving). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const spec = await latestArtifact(params.id, "product-spec");
  if (!spec) return NextResponse.json({ error: "Finish Define the Job first." }, { status: 400 });
  try {
    const title = (await getProject(params.id))?.title || "Agent";
    const design = await generateAgentDesign(spec.payload as Record<string, any>, title);
    const state = { design, approved: false, spec_version: spec.version };
    await savePhaseState(params.id, "agent-design", state);
    return NextResponse.json(state, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to design the agent." }, { status: 500 });
  }
}
