import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, getProject } from "@/lib/store";
import { generateStackProposal, StackProposal } from "@/lib/phases/engineering";
import { workspaceExists } from "@/lib/workspace";

/**
 * Stage 1: the architect proposes the stack from the spec + design.
 *
 * Cycle ≥2 with a built app: the stack is a settled decision the codebase
 * already embodies — reuse it instantly instead of re-proposing (migrating a
 * live app's stack is not an iteration; it's a rewrite).
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec found." }, { status: 400 });
  const spec = specArtifact.payload as Record<string, any>;
  const designArtifact = await latestArtifact(params.id, "design-spec");
  const design = (designArtifact?.payload as Record<string, any>) ?? null;
  const project = await getProject(params.id);
  const cycle = project?.cycle ?? 1;

  try {
    if (cycle > 1 && (await workspaceExists(project?.title || "Untitled"))) {
      const prior = (await latestArtifact(params.id, "stack-selection"))?.payload as Record<string, any> | undefined;
      if (prior?.choices?.length) {
        const proposal: StackProposal = {
          choices: prior.choices,
          architecture_summary:
            `${prior.architecture_summary || ""} (Carried over from cycle ${cycle - 1} — the app is built ` +
            "on this stack; iteration changes the product, not the foundations.)",
          mermaid_diagram: prior.mermaid_diagram || "",
          key_decisions: prior.key_decisions || [],
        };
        const state = (await getPhaseState<any>(params.id, "engineering")) || {};
        await savePhaseState(params.id, "engineering", { ...state, proposal, stack: null, workspace: null });
        return NextResponse.json({ proposal, reused: true });
      }
    }

    const proposal = await generateStackProposal(spec, design, project?.title || "Untitled");
    const state = (await getPhaseState<any>(params.id, "engineering")) || {};
    await savePhaseState(params.id, "engineering", { ...state, proposal, stack: null, workspace: null });
    return NextResponse.json({ proposal });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to propose stack." }, { status: 500 });
  }
}
