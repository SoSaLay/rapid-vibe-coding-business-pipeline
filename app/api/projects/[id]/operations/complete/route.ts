import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, saveArtifact, completePhase, skipPhase } from "@/lib/store";

/** Sign-off: ops report exists → save ops-report artifact → complete phase. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));

  // Skip route
  if (body.skip) {
    const updated = await skipPhase(params.id, "operations");
    return NextResponse.json({ project: updated }, { status: 200 });
  }

  const state = await getPhaseState<any>(params.id, "operations");
  if (!state?.report) {
    return NextResponse.json(
      { error: "No ops report yet — generate it first." },
      { status: 400 }
    );
  }

  try {
    const checkLog = state.checkLog ?? {};
    const totalChecks = (state.report.tools ?? []).reduce(
      (n: number, t: any) => n + (t.checks?.length ?? 0),
      0
    );
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "operations",
      artifactType: "ops-report",
      payload: {
        ...state.report,
        prod_url: state.prod_url,
        signed_off_at: new Date().toISOString(),
        checks_done_at_signoff: Object.keys(checkLog).length,
        checks_total: totalChecks,
      },
      inputs: ["deploy-manifest"],
      status: "complete",
    });
    const updated = await completePhase(params.id, "operations");
    return NextResponse.json({ artifact, project: updated }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to complete the operations phase." },
      { status: 500 }
    );
  }
}
