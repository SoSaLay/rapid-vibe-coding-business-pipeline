import { NextRequest, NextResponse } from "next/server";
import { latestArtifact, saveArtifact } from "@/lib/store";

/** Save the owner's edits to the spec as a new version; later stages always read the latest. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const prev = await latestArtifact(params.id, "product-spec");
  if (!prev) return NextResponse.json({ error: "No spec yet." }, { status: 400 });
  const next = body?.spec;
  if (!next || typeof next !== "object" || Array.isArray(next)) return NextResponse.json({ error: "Invalid spec." }, { status: 400 });
  const old = prev.payload as Record<string, any>;
  const artifact = await saveArtifact({
    projectId: params.id,
    phase: "product-owner",
    artifactType: "product-spec",
    // Keep pipeline-owned fields from the previous version (idea type, playbooks) whatever the client sent.
    payload: { ...next, idea_type: old.idea_type, frameworks_applied: old.frameworks_applied, edited_by_owner: true },
    inputs: [`product-spec@${prev.version}`],
  });
  return NextResponse.json({ artifact }, { status: 201 });
}
