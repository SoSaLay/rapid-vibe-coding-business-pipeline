import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, saveArtifact, savePhaseState, completePhase, getProject, writeMeta } from "@/lib/store";
import { planSearches, gatherEvidence, synthesizeValidation } from "@/lib/phases/idea-validation";
import { interjectionContext } from "@/lib/interjections";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec to validate." }, { status: 400 });
  const spec = specArtifact.payload as Record<string, any>;

  try {
    const plan = await planSearches(spec);
    const evidence = await gatherEvidence(plan, spec.problem_statement || spec.summary || "");
    if (evidence.length === 0) {
      return NextResponse.json(
        { error: "No online discussion found. Try again or refine the idea — the signal may genuinely be thin." },
        { status: 422 }
      );
    }
    const report = await synthesizeValidation(spec, evidence, await interjectionContext(params.id, "idea-validation"));

    // Persist the working evidence + the verdict artifact.
    await savePhaseState(params.id, "idea-validation", { plan, evidence });
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "idea-validation",
      artifactType: "market-report",
      payload: {
        ...report,
        sources: evidence.map((e) => ({ kind: e.kind, title: e.title, url: e.url })),
      },
      inputs: [`product-spec@${specArtifact.version}`],
      status: report.verdict === "reject" || report.verdict === "archive" ? "rejected" : "complete",
    });

    // Gate: only a "build" verdict advances the pipeline.
    let project = await getProject(params.id);
    if (report.verdict === "build") {
      project = await completePhase(params.id, "idea-validation");
    } else if (project) {
      project.phase_status["idea-validation"] = report.verdict === "refine" ? "active" : "skipped";
      await writeMeta(project);
    }

    return NextResponse.json({ artifact, plan, evidence, project }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Validation failed." }, { status: 500 });
  }
}
