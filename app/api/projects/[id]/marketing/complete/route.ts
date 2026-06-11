import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, saveArtifact, completePhase } from "@/lib/store";
import { computePostingStats } from "@/lib/phases/marketing";

/** Stage 4 — sign-off: launched + system running → campaign-report. The posting loop keeps working after. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "marketing-sales");
  if (!state?.plan) return NextResponse.json({ error: "No campaign plan yet — generate it first." }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  const checklist = state.plan.launch_checklist ?? [];
  const doneSet = new Set<string>(state.checklistDone ?? []);
  const openItems = checklist.filter((c: any) => !doneSet.has(c.id));
  const blockers: string[] = [];
  if (!(state.posts ?? []).length) blockers.push("No content batch generated yet.");
  if (openItems.length) blockers.push(`${openItems.length} launch checklist item(s) still open.`);
  if (blockers.length && !body.force) {
    return NextResponse.json({ error: "Launch not complete. Pass force to sign off anyway.", blockers }, { status: 400 });
  }

  const forced = blockers.length > 0 && !!body.force;
  const stats = computePostingStats(state.posts ?? [], state.postedIds ?? [], new Date().toISOString());

  try {
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "marketing-sales",
      artifactType: "campaign-report",
      payload: {
        strategy_summary: state.plan.strategy_summary,
        channels: state.plan.channels,
        content_pillars: state.plan.content_pillars,
        weekly_rhythm: state.plan.weekly_rhythm,
        launch_checklist: checklist.map((c: any) => ({ ...c, done: doneSet.has(c.id) })),
        waitlist_email: state.plan.waitlist_email,
        metrics_to_watch: state.plan.metrics_to_watch,
        posting_stats_at_signoff: stats,
        forced,
        blockers_at_signoff: forced ? blockers : [],
      },
      inputs: ["deploy-manifest", "audience-brief"],
      status: "complete",
    });
    const updated = await completePhase(params.id, "marketing-sales");
    return NextResponse.json({ artifact, project: updated }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to complete the marketing phase." }, { status: 500 });
  }
}
