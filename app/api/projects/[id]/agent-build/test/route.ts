import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { loadBuild, saveBuild } from "@/lib/agent/build-context";
import { unitTestAdapter } from "@/lib/agent/registry";
import { agentEnv, renderDotEnv } from "@/lib/agent/env";
import { modelKeyEnv } from "@/lib/agent/design";
import { readExampleResults } from "@/lib/phases/agent-engineering";

/** Step 3: tool checks + the example tasks, in dry run (write tools never execute). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.build?.install?.ok || !ctx.design) return NextResponse.json({ error: "Install the agent first." }, { status: 400 });
  const env = await agentEnv(params.id, ctx.design, ctx.slug);
  // Keys may have been added since the code was written.
  await fs.writeFile(path.join(ctx.dir, ".env"), renderDotEnv(env), { mode: 0o600 });
  const run = await (await unitTestAdapter(params.id)).run({ dir: ctx.dir, env: { ...env, AGENT_DRY_RUN: "1" } });
  const examples = await readExampleResults(ctx.dir);
  const tests = {
    ...run,
    examples,
    skipped_examples: !!modelKeyEnv(ctx.design.model.selected) && !env[modelKeyEnv(ctx.design.model.selected)],
    at: new Date().toISOString(),
  };
  const build = { ...ctx.build, tests };
  await saveBuild(params.id, ctx.phase, build);
  return NextResponse.json({ build });
}
