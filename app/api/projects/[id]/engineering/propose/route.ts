import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, getProject } from "@/lib/store";
import { generateStackProposal } from "@/lib/phases/engineering";

/** Stage 1: the architect proposes the stack from the spec + design. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec found." }, { status: 400 });
  const spec = specArtifact.payload as Record<string, any>;
  const designArtifact = await latestArtifact(params.id, "design-spec");
  const design = (designArtifact?.payload as Record<string, any>) ?? null;
  const project = await getProject(params.id);

  try {
    const proposal = await generateStackProposal(spec, design, project?.title || "Untitled");
    const state = (await getPhaseState<any>(params.id, "engineering")) || {};
    await savePhaseState(params.id, "engineering", { ...state, proposal, stack: null, workspace: null });
    return NextResponse.json({ proposal });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to propose stack." }, { status: 500 });
  }
}
