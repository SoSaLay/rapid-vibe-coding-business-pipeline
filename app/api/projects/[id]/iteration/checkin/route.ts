import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, getPhaseState, savePhaseState, getProject } from "@/lib/store";
import {
  CORE_QUESTIONS,
  generateAppQuestions,
  buildIterationContext,
  PulledSignal,
} from "@/lib/phases/iteration";
import { computePostingStats } from "@/lib/phases/marketing";

/** Stage 1: build the check-in — core questions + app-specific questions + auto-pulled signals. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const deploy = await latestArtifact(params.id, "deploy-manifest");
  if (!deploy) {
    return NextResponse.json(
      { error: "Iteration needs a deployed product — complete Deployment first." },
      { status: 400 }
    );
  }
  const project = await getProject(params.id);
  const spec = ((await latestArtifact(params.id, "product-spec"))?.payload as Record<string, any>) ?? null;
  const campaign = ((await latestArtifact(params.id, "campaign-report"))?.payload as Record<string, any>) ?? null;
  const audienceBrief = ((await latestArtifact(params.id, "audience-brief"))?.payload as Record<string, any>) ?? null;

  // Auto-pull what the pipeline already knows — the owner shouldn't retype it.
  const signals: PulledSignal[] = [];
  const marketing = await getPhaseState<any>(params.id, "marketing-sales");
  if (marketing?.posts?.length) {
    const stats = computePostingStats(marketing.posts, marketing.postedIds ?? [], new Date().toISOString());
    signals.push({
      label: "Posting loop (Phase 9)",
      value: `${stats.posted}/${stats.due_to_date} due posts published, ${stats.streak_days}-day streak`,
    });
  }
  const ops = await getPhaseState<any>(params.id, "operations");
  if (ops?.report) {
    const total = (ops.report.tools ?? []).reduce((n: number, t: any) => n + (t.checks?.length ?? 0), 0);
    const done = Object.keys(ops.checkLog ?? {}).length;
    signals.push({ label: "Ops checklist (Phase 10)", value: `${done}/${total} checks have been done at least once` });
  }
  if (audienceBrief?.verdict) {
    signals.push({ label: "Pre-marketing verdict (Phase 4)", value: String(audienceBrief.verdict) });
  }

  const context = buildIterationContext({
    productTitle: project?.title || "Untitled",
    cycle: project?.cycle ?? 1,
    spec,
    ideaType: (project as any)?.idea_type,
    deploy: deploy.payload as Record<string, any>,
    campaign,
    audienceBrief,
    signals,
  });

  try {
    const appQuestions = await generateAppQuestions(context);
    const questions = [...CORE_QUESTIONS, ...appQuestions];
    const prior = (await getPhaseState<any>(params.id, "iteration")) ?? {};
    await savePhaseState(params.id, "iteration", {
      ...prior,
      questions,
      signals,
      context,
      answers: prior.answers ?? {},
      brief: null, // new check-in invalidates an old brief
    });
    return NextResponse.json({ questions, signals }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to build the check-in." }, { status: 500 });
  }
}
