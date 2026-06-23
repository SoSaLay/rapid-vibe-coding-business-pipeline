import { NextRequest, NextResponse } from "next/server";
import path from "path";
import os from "os";
import { isValidIdeaType } from "@/lib/idea-types";
import { importLocalProject } from "@/lib/import-local";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  let src = String(body.path || "").trim();
  if (!src) return NextResponse.json({ error: "Enter the path to a project folder on this computer." }, { status: 400 });
  if (src.startsWith("~")) src = path.join(os.homedir(), src.slice(1));
  src = path.resolve(src);

  const ideaType = isValidIdeaType(body.ideaType) ? (body.ideaType as string) : undefined;

  try {
    const result = await importLocalProject(src, ideaType);
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Import failed." }, { status: 500 });
  }
}
