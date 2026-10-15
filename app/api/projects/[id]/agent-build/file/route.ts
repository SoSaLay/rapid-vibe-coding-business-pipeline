import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { loadBuild } from "@/lib/agent/build-context";
import { isGeneratedFile } from "@/lib/phases/agent-engineering";

/** Read one generated file for the Your codebase view. Only files the build wrote — never .env. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const rel = req.nextUrl.searchParams.get("path") || "";
  const ctx = await loadBuild(params.id);
  if (!ctx.build || !isGeneratedFile(ctx.build.files, rel)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const content = await fs.readFile(path.join(ctx.dir, rel), "utf8");
    return NextResponse.json({ path: rel, content });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
