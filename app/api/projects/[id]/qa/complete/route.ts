import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, saveArtifact, completePhase, getProject } from "@/lib/store";
import { parseQaResults, evaluateExit, QA_RESULTS_PATH, QaPlan, ManualResponse } from "@/lib/phases/qa";
import { readWorkspaceFile } from "@/lib/workspace";

/** Stage 4 — sign-off: evaluate the exit criteria → qa-report artifact, complete the phase. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<{ plan?: QaPlan; manual?: ManualResponse[]; fixRound?: number }>(params.id, "qa");
  if (!state?.plan) return NextResponse.json({ error: "No QA plan yet — generate it first." }, { status: 400 });
  const project = await getProject(params.id);
  const title = project?.title || "Untitled";
  const body = await req.json().catch(() => ({}));
  const plan = state.plan;
  const manual = state.manual ?? [];

  const raw = await readWorkspaceFile(title, QA_RESULTS_PATH);
  const results = raw ? parseQaResults(raw) : null;
  const exit = evaluateExit(plan, results, manual);
  if (!exit.ready && !body.force) {
    return NextResponse.json(
      { error: "Exit criteria not met. Pass force to sign off anyway.", blockers: exit.blockers },
      { status: 400 }
    );
  }

  const forced = !exit.ready && !!body.force;
  const failedSecurity = (results?.security ?? [])
    .filter((s) => s.status === "fail")
    .map((s) => ({ ...s, title: plan.security_checks.find((c) => c.id === s.id)?.title ?? s.id }));
  const openDefects = [
    ...(results?.cases ?? [])
      .filter((c) => c.status === "fail")
      .map((c) => ({ id: c.id, title: plan.test_cases.find((t) => t.id === c.id)?.title ?? c.id, notes: c.notes })),
    ...manual
      .filter((m) => m.status === "fail")
      .map((m) => ({ id: m.id, title: plan.manual_checklist.find((i) => i.id === m.id)?.title ?? m.id, notes: m.note })),
  ];

  try {
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "qa",
      artifactType: "qa-report",
      payload: {
        verdict: forced ? "ship-with-warnings" : "ship",
        forced,
        blockers_at_signoff: forced ? exit.blockers : [],
        scope_summary: plan.scope_summary,
        suite: results?.suite ?? null,
        cases: {
          total: plan.test_cases.length,
          passed: (results?.cases ?? []).filter((c) => c.status === "pass").length,
          failed: (results?.cases ?? []).filter((c) => c.status === "fail").length,
          skipped: (results?.cases ?? []).filter((c) => c.status === "skip").length,
        },
        security: {
          total: plan.security_checks.length,
          passed: (results?.security ?? []).filter((s) => s.status === "pass").length,
          failed: failedSecurity.length,
          na: (results?.security ?? []).filter((s) => s.status === "na").length,
          findings: failedSecurity,
        },
        npm_audit: results?.npm_audit ?? null,
        manual: plan.manual_checklist.map((m) => ({
          ...m,
          response: manual.find((r) => r.id === m.id) ?? null,
        })),
        open_defects: openDefects,
        fixed_during_qa: results?.fixed_during_qa ?? [],
        fix_rounds: state.fixRound ?? 0,
        exit_criteria: plan.exit_criteria,
      },
      inputs: ["build-manifest", "product-spec"],
      status: "complete",
    });
    const updated = await completePhase(params.id, "qa");
    return NextResponse.json({ artifact, project: updated }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to complete QA." }, { status: 500 });
  }
}
