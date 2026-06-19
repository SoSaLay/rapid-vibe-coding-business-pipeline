import { NextRequest, NextResponse } from "next/server";
import {
  getPhaseState,
  savePhaseState,
  saveArtifact,
  completePhase,
  startNextCycle,
  setArchived,
  getProject,
} from "@/lib/store";
import { renderBriefForPO, IterationBrief, CheckinQuestion } from "@/lib/phases/iteration";

type Decision = "next-cycle" | "keep-collecting" | "archive";

/**
 * Stage 3 — the owner's decision gate:
 *   next-cycle      → iteration-brief artifact + cycle++ + Product Owner re-activates
 *   keep-collecting → nothing locks; come back with more data
 *   archive         → final brief recorded, project flagged archived (reversible)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const decision: Decision = body.decision;
  if (!["next-cycle", "keep-collecting", "archive"].includes(decision)) {
    return NextResponse.json({ error: "decision must be next-cycle, keep-collecting, or archive." }, { status: 400 });
  }

  const state = await getPhaseState<any>(params.id, "iteration");

  if (decision === "keep-collecting") {
    await savePhaseState(params.id, "iteration", { ...(state ?? {}), lastDecision: "keep-collecting" });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const brief: IterationBrief | null = state?.brief ?? null;
  if (!brief) {
    return NextResponse.json({ error: "No iteration brief yet — run the check-in and synthesis first." }, { status: 400 });
  }
  const questions: CheckinQuestion[] = state.questions ?? [];
  const answers: Record<string, string> = state.answers ?? {};
  const project = await getProject(params.id);
  const cycle = project?.cycle ?? 1;

  if (decision === "next-cycle") {
    const focusIds: string[] = (body.focusIds ?? brief.recommended_focus ?? []).filter((id: string) =>
      brief.next_moves.some((m) => m.id === id)
    );
    if (focusIds.length === 0) {
      return NextResponse.json({ error: "Pick at least one next move to focus the cycle on." }, { status: 400 });
    }
    try {
      const poHandoff = renderBriefForPO(brief, focusIds, answers, questions, cycle + 1);
      const artifact = await saveArtifact({
        projectId: params.id,
        phase: "iteration",
        artifactType: "iteration-brief",
        payload: { ...brief, decision, focus_ids: focusIds, answers, cycle, po_handoff: poHandoff },
        inputs: ["ops-report", "campaign-report", "deploy-manifest"],
        status: "complete",
      });
      await completePhase(params.id, "iteration");
      const updated = await startNextCycle(params.id);
      return NextResponse.json({ artifact, project: updated }, { status: 201 });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Failed to start the next cycle." }, { status: 500 });
    }
  }

  // decision === "archive"
  try {
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "iteration",
      artifactType: "iteration-brief",
      payload: {
        ...brief,
        decision,
        answers,
        cycle,
        archive_note: typeof body.note === "string" ? body.note : "",
      },
      inputs: ["ops-report", "campaign-report", "deploy-manifest"],
      status: "complete",
    });
    await completePhase(params.id, "iteration");
    const updated = await setArchived(params.id, true);
    return NextResponse.json({ artifact, project: updated }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to archive the project." }, { status: 500 });
  }
}
