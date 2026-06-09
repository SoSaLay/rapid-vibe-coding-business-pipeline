import { NextRequest, NextResponse } from "next/server";
import { skipPhase } from "@/lib/store";
import { PhaseId } from "@/lib/pipeline";

/** Generic skip for any OPTIONAL phase. Body: { phase: PhaseId }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const phase = body.phase as PhaseId;
  if (!phase) return NextResponse.json({ error: "Missing phase." }, { status: 400 });
  const project = await skipPhase(params.id, phase);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project });
}
