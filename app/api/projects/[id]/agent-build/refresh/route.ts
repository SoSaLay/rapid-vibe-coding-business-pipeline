import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { promises as fs } from "fs";
import path from "path";
import { loadBuild, saveBuild, toolsSignature } from "@/lib/agent/build-context";
import { renderAgent } from "@/lib/agent/render";
import { writeCodebase } from "@/lib/phases/agent-engineering";
import { uvSync } from "@/lib/agent/adapters/pytest-uv";
import { getDeploy } from "@/lib/agent/deploy";
import { deployFiles } from "@/lib/agent/adapters/deploy-files";

/**
 * Light update: the approved design changed only in skills, knowledge, model, memory, approvals or limits.
 * Re-render from the stored code (no model rewrite), reinstall, and hand over to Evaluations.
 * A change to the tools themselves returns 409: that needs the full Build step.
 */
async function handlePost(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.design || !ctx.spec || !ctx.build) return NextResponse.json({ error: "Build the agent first." }, { status: 400 });
  if (!ctx.build.logic) return NextResponse.json({ error: "This build predates light updates. Rebuild once; later changes can be light." }, { status: 409 });
  if (ctx.build.tools_signature !== toolsSignature(ctx.design)) {
    return NextResponse.json({ error: "The tools changed, so the code has to be rewritten. Use Rebuild." }, { status: 409 });
  }
  try {
    const { files, knowledge } = await renderAgent({ projectId: params.id, title: ctx.title, design: ctx.design, spec: ctx.spec, logic: ctx.build.logic });
    // Keep the deploy files in step if the agent was already packaged.
    const deployState = await getDeploy(params.id);
    if (deployState.prepared_at) files.push(...deployFiles({ title: ctx.title, design: ctx.design, host: deployState.host ?? "agentcore" }));
    // Skills or knowledge that were removed must disappear from the repo too.
    for (const dir of ["skills", "knowledge"]) await fs.rm(path.join(ctx.dir, dir), { recursive: true, force: true });
    await writeCodebase(ctx.dir, files, `agent: light update from approved design v${ctx.designVersion}`);
    const sync = await uvSync(ctx.dir);
    const build = {
      ...ctx.build,
      design_version: ctx.designVersion,
      files: files.filter((f) => f.explains).map((f) => ({ path: f.path, explains: f.explains })),
      written_at: new Date().toISOString(),
      knowledge,
      install: { ok: sync.ok, output: sync.output, at: new Date().toISOString() },
      tests: undefined,
      light: true,
    };
    await saveBuild(params.id, ctx.phase, build as any);
    return NextResponse.json({ build }, { status: sync.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Light update failed." }, { status: 500 });
  }
}

export const POST = tracked("engineering", "Updating the code", handlePost);
