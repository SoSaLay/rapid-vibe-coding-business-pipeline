import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, savePhaseState } from "@/lib/store";
import { generateKit, selectMarketingFrameworks } from "@/lib/phases/pre-marketing";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const specArtifact = await latestArtifact(params.id, "product-spec");
  if (!specArtifact) return NextResponse.json({ error: "No product spec found." }, { status: 400 });
  const spec = specArtifact.payload as Record<string, any>;
  const marketArtifact = await latestArtifact(params.id, "market-report");
  const market = (marketArtifact?.payload as Record<string, any>) ?? null;

  try {
    const context = `Problem: ${spec.problem_statement || spec.summary || ""}\nUsers: ${(spec.target_users || []).join(", ")}`;
    const frameworks = await selectMarketingFrameworks(context);
    const kit = await generateKit(spec, market, frameworks.ids);
    await savePhaseState(params.id, "pre-marketing", { frameworks, kit });
    return NextResponse.json({ kit, frameworks });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate kit." }, { status: 500 });
  }
}
