import { NextRequest, NextResponse } from "next/server";
import { skipPhase } from "@/lib/store";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await skipPhase(params.id, "idea-validation");
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project });
}
