import { NextRequest, NextResponse } from "next/server";
import { getProject, listArtifacts, getPhaseState } from "@/lib/store";
import { PODialogue } from "@/lib/phases/product-owner";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const artifacts = await listArtifacts(params.id);
  const productOwner = await getPhaseState<PODialogue>(params.id, "product-owner");
  const ideaValidation = await getPhaseState(params.id, "idea-validation");
  const preMarketing = await getPhaseState(params.id, "pre-marketing");
  const productDesign = await getPhaseState(params.id, "product-design");
  const engineering = await getPhaseState(params.id, "engineering");
  const qa = await getPhaseState(params.id, "qa");
  const deployment = await getPhaseState(params.id, "deployment");
  const marketing = await getPhaseState(params.id, "marketing-sales");
  const operations = await getPhaseState(params.id, "operations");
  const iteration = await getPhaseState(params.id, "iteration");
  return NextResponse.json({
    project,
    artifacts,
    phaseState: {
      "product-owner": productOwner,
      "idea-validation": ideaValidation,
      "pre-marketing": preMarketing,
      "product-design": productDesign,
      engineering,
      qa,
      deployment,
      "marketing-sales": marketing,
      operations,
      iteration,
    },
  });
}
