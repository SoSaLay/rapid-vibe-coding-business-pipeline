import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects, saveArtifact, getProject, writeMeta } from "@/lib/store";
import { isValidIdeaType } from "@/lib/idea-types";

export interface RawIdeaPayload {
  source: "direct";
  input_method: "voice" | "text" | string;
  title: string;
  raw_text: string;
  idea_type: string;
}

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const title0 = (body.title || "").trim();
  const rawText = (body.text || "").trim();
  const inputMethod: string = body.inputMethod || "text";

  if (!rawText) return NextResponse.json({ error: "Idea is empty." }, { status: 400 });
  const title = title0 || rawText.slice(0, 60);

  // Idea type is no longer chosen at capture — the owner labels it later on the home list.
  // Default to web-app for safe downstream context; mark unlabeled unless one was explicitly sent.
  // An agent IS its idea type — it arrives labeled.
  const kind = body.kind === "agent" ? "agent" : "project";
  const explicit = kind === "agent" || isValidIdeaType(body.ideaType);
  const ideaType = kind === "agent" ? "ai-agent" : explicit ? (body.ideaType as string) : "web-app";

  const project = await createProject(title, ideaType, kind);
  const payload: RawIdeaPayload = {
    source: "direct",
    input_method: inputMethod,
    title,
    raw_text: rawText,
    idea_type: ideaType,
  };
  const artifact = await saveArtifact<RawIdeaPayload>({
    projectId: project.id,
    phase: "business-owner",
    artifactType: "raw-idea",
    payload,
  });

  // Track whether the owner has explicitly labeled the type yet.
  const meta = await getProject(project.id);
  if (meta) {
    meta.labeled = explicit;
    await writeMeta(meta);
  }

  // Capture happens here, not in a stage — the project opens at Define the Problem (agents: Define the Job).

  return NextResponse.json({ project: meta ?? project, artifact }, { status: 201 });
}
