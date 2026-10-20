import { NextRequest, NextResponse } from "next/server";
import { loadBuild } from "@/lib/agent/build-context";
import { evalViewer } from "@/lib/agent/eval-viewer";

/** GET → { label, url } of the tracing tool where this agent's evaluation runs can be seen, or {} when none is connected. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  return NextResponse.json((await evalViewer(ctx.slug)) ?? {});
}
