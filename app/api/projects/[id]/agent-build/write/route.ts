import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { loadBuild, saveBuild } from "@/lib/agent/build-context";
import { frameworkAdapter } from "@/lib/agent/registry";
import { agentEnv, renderDotEnv } from "@/lib/agent/env";
import { envVarsUsed, exampleTasks, generateLogic, writeCodebase } from "@/lib/phases/agent-engineering";

/** Step 1: write the codebase from the APPROVED design. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.design) return NextResponse.json({ error: "Approve the Agent Design first." }, { status: 400 });
  if (!ctx.spec) return NextResponse.json({ error: "No job definition found." }, { status: 400 });
  try {
    const logic = await generateLogic(ctx.design, ctx.spec, ctx.title);
    const framework = await frameworkAdapter(params.id);
    const files = framework.render({ title: ctx.title, design: ctx.design, logic, exampleTasks: exampleTasks(ctx.spec) });
    await fs.mkdir(ctx.dir, { recursive: true });
    const committed = await writeCodebase(ctx.dir, files, `agent: build from approved design v${ctx.designVersion}`);
    await fs.writeFile(path.join(ctx.dir, ".env"), renderDotEnv(await agentEnv(params.id, ctx.design, ctx.slug)), { mode: 0o600 });
    const build = {
      design_version: ctx.designVersion,
      workspace_path: ctx.dir,
      files: files.map((f) => ({ path: f.path, explains: f.explains })),
      written_at: new Date().toISOString(),
      committed,
      env_vars: envVarsUsed(logic),
    };
    await saveBuild(params.id, ctx.phase, build);
    return NextResponse.json({ build }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to write the code." }, { status: 500 });
  }
}
