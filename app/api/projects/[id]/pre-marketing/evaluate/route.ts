import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, saveArtifact, completePhase, getProject, writeMeta } from "@/lib/store";
import { listSignups } from "@/lib/supabase";
import { synthesizeAudienceBrief } from "@/lib/phases/pre-marketing";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getPhaseState<any>(params.id, "pre-marketing");
  if (!state?.kit) return NextResponse.json({ error: "No validation kit found." }, { status: 400 });

  let signups;
  try {
    signups = await listSignups(params.id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not read signups." }, { status: 500 });
  }

  const metrics = {
    signups: signups.length,
    presale_interest: signups.filter((s) => s.wants_presale).length,
    answers_sample: signups
      .map((s) => Object.values(s.answers || {}).join(" | "))
      .filter(Boolean)
      .slice(0, 15),
  };

  try {
    const brief = await synthesizeAudienceBrief(state.kit, metrics);
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "pre-marketing",
      artifactType: "audience-brief",
      payload: { ...brief, metrics },
      inputs: ["market-report"],
      status: brief.verdict === "stop" ? "rejected" : "complete",
    });

    let project = await getProject(params.id);
    if (brief.verdict === "proceed") {
      project = await completePhase(params.id, "pre-marketing");
    } else if (project) {
      project.phase_status["pre-marketing"] = brief.verdict === "stop" ? "skipped" : "active";
      await writeMeta(project);
    }
    return NextResponse.json({ artifact, project }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to evaluate." }, { status: 500 });
  }
}
