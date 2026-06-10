import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState, saveArtifact } from "@/lib/store";
import { normalizeChoices } from "@/lib/stack";

/** Approve the stack (with optional per-slot overrides from the selector) → stack-selection artifact. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "engineering");
  if (!state?.proposal) return NextResponse.json({ error: "Generate the stack proposal first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  // User overrides (if any) win over the architect's choices; both normalize to valid options.
  const choices = normalizeChoices(body.choices || state.proposal.choices || []);

  try {
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "engineering",
      artifactType: "stack-selection",
      payload: {
        choices,
        architecture_summary: state.proposal.architecture_summary,
        mermaid_diagram: state.proposal.mermaid_diagram,
        key_decisions: state.proposal.key_decisions,
      },
      inputs: ["product-spec", "design-spec"],
      status: "complete",
    });
    await savePhaseState(params.id, "engineering", { ...state, stack: choices });
    return NextResponse.json({ artifact, choices }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to approve stack." }, { status: 500 });
  }
}
