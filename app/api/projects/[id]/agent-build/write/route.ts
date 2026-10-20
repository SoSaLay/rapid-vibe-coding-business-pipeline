import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { promises as fs } from "fs";
import path from "path";
import { loadBuild, saveBuild, toolsSignature } from "@/lib/agent/build-context";
import { renderAgent } from "@/lib/agent/render";
import { agentEnv, renderDotEnv } from "@/lib/agent/env";
import { envVarsUsed, generateLogic, writeCodebase } from "@/lib/phases/agent-engineering";

/** Step 1: write the codebase from the APPROVED design. */
async function handlePost(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.design) return NextResponse.json({ error: "Approve the Agent Design first." }, { status: 400 });
  if (!ctx.spec) return NextResponse.json({ error: "No job definition found." }, { status: 400 });
  try {
    const logic = await generateLogic(ctx.design, ctx.spec, ctx.title);
    const { files, knowledge } = await renderAgent({ projectId: params.id, title: ctx.title, design: ctx.design, spec: ctx.spec, logic });
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
      logic,
      tools_signature: toolsSignature(ctx.design),
      knowledge,
    };
    await saveBuild(params.id, ctx.phase, build);
    return NextResponse.json({ build }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to write the code." }, { status: 500 });
  }
}

export const POST = tracked("engineering", "Writing the agent's code", handlePost);
