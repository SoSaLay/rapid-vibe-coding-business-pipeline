import { NextRequest, NextResponse } from "next/server";
import { getProjectSettings, saveProjectSettings } from "@/lib/store";

const VALID_ENGINES = new Set(["google-stitch", "claude-html"]);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json(await getProjectSettings(params.id));
}

/** Update project settings. Body: { designEngine?, brandDirection? }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.designEngine === "string") {
    if (!VALID_ENGINES.has(body.designEngine)) {
      return NextResponse.json({ error: "Unknown engine." }, { status: 400 });
    }
    patch.designEngine = body.designEngine;
  }
  if (body.brandDirection && typeof body.brandDirection === "object") patch.brandDirection = body.brandDirection;
  if (typeof body.emailEnabled === "boolean") patch.emailEnabled = body.emailEnabled;
  if (typeof body.emailProvider === "string") patch.emailProvider = body.emailProvider;
  const next = await saveProjectSettings(params.id, patch);
  return NextResponse.json(next);
}
