import { NextRequest, NextResponse } from "next/server";
import { getProject, writeMeta, latestArtifact, saveArtifact } from "@/lib/store";
import { isValidIdeaType } from "@/lib/idea-types";

/**
 * Label (or relabel) an idea's type from the home list's "Label me" dropdown.
 * Updates the project meta and re-stamps the raw-idea artifact so every downstream
 * phase (which reads idea_type off the raw idea / spec) adapts to the chosen type.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const ideaType = body.ideaType as string;
  if (!isValidIdeaType(ideaType)) return NextResponse.json({ error: "Unknown idea type." }, { status: 400 });

  const meta = await getProject(params.id);
  if (!meta) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  meta.idea_type = ideaType;
  meta.labeled = true;
  await writeMeta(meta);

  // Re-stamp the raw idea so downstream context picks up the new label.
  const raw = await latestArtifact(params.id, "raw-idea");
  if (raw) {
    await saveArtifact({
      projectId: params.id,
      phase: "business-owner",
      artifactType: "raw-idea",
      payload: { ...(raw.payload as Record<string, unknown>), idea_type: ideaType },
    });
  }

  return NextResponse.json({ project: meta });
}
