import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects, saveArtifact, completePhase } from "@/lib/store";
import { getConnector } from "@/lib/connectors/registry";

export interface RawIdeaPayload {
  source: "direct" | "pull";
  input_method: "voice" | "text" | string;
  title: string;
  raw_text: string;
  connector?: { id: string; sourceId: string; sourceTitle: string; url?: string };
}

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const mode = body.mode as "direct" | "pull";

  let title = (body.title || "").trim();
  let rawText = (body.text || "").trim();
  let inputMethod: string = body.inputMethod || "text";
  let connectorMeta: RawIdeaPayload["connector"] | undefined;

  if (mode === "pull") {
    const connector = getConnector(body.connector);
    if (!connector) return NextResponse.json({ error: "Unknown connector." }, { status: 400 });
    if (!body.sourceId) return NextResponse.json({ error: "No source selected." }, { status: 400 });
    try {
      const ctx = await connector.fetchContext(body.sourceId);
      rawText = ctx.text;
      title = title || ctx.title;
      inputMethod = connector.id;
      connectorMeta = { id: connector.id, sourceId: ctx.sourceId, sourceTitle: ctx.title, url: ctx.url };
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Failed to pull context." }, { status: 500 });
    }
  }

  if (!rawText) return NextResponse.json({ error: "Idea is empty." }, { status: 400 });
  if (!title) title = rawText.slice(0, 60);

  const project = await createProject(title);
  const payload: RawIdeaPayload = {
    source: mode,
    input_method: inputMethod,
    title,
    raw_text: rawText,
    connector: connectorMeta,
  };
  const artifact = await saveArtifact<RawIdeaPayload>({
    projectId: project.id,
    phase: "business-owner",
    artifactType: "raw-idea",
    payload,
    links: connectorMeta?.url ? { source: connectorMeta.url } : undefined,
  });

  // Phase 1 done — hand off to the Product Owner.
  const advanced = await completePhase(project.id, "business-owner");

  return NextResponse.json({ project: advanced ?? project, artifact }, { status: 201 });
}
