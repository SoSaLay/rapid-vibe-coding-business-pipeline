import { NextRequest, NextResponse } from "next/server";
import { loadBuild } from "@/lib/agent/build-context";
import { chosenHost, getDeploy, prepare, saveDeploy } from "@/lib/agent/deploy";

/** Write the deploy files into the agent repo (server, state, auth, ops, Dockerfile, CI) and lock dependencies. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.design || !ctx.build) return NextResponse.json({ error: "Build the agent first." }, { status: 400 });
  const host = await chosenHost(params.id);
  const r = await prepare({ projectId: params.id, dir: ctx.dir, title: ctx.title, design: ctx.design, host });
  const s = await getDeploy(params.id);
  if (r.ok) await saveDeploy(params.id, { ...s, host, prepared_at: new Date().toISOString() });
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
