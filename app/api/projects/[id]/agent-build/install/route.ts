import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import os from "os";
import path from "path";
import { loadBuild, saveBuild } from "@/lib/agent/build-context";
import { renderAgent } from "@/lib/agent/render";
import { uvAvailable, uvSync } from "@/lib/agent/adapters/pytest-uv";
import { envVarsUsed, generateLogic, writeCodebase } from "@/lib/phases/agent-engineering";

// Import everything except building the agent itself (that needs the model key, checked in Test).
const CHECK =
  "import agent.tools, agent.schemas, agent.prompt, agent.fallback, agent.safety; " +
  "from langchain.agents import create_agent; from langchain.agents.middleware import HumanInTheLoopMiddleware; " +
  "import py_compile; py_compile.compile('agent/graph.py', doraise=True); py_compile.compile('agent/run.py', doraise=True)";

function compile(dir: string): Promise<{ ok: boolean; output: string }> {
  const uv = process.env.UV_BIN || path.join(os.homedir(), ".local", "bin", "uv");
  return new Promise((resolve) =>
    execFile(uv, ["run", "python", "-c", CHECK], { cwd: dir, timeout: 120_000 }, (err, so, se) =>
      resolve({ ok: !err, output: `${so}${se}`.slice(-4000) })
    )
  );
}

/** Step 2: install Python + packages, then check the agent loads. One automatic repair if it doesn't. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.build || !ctx.design || !ctx.spec) return NextResponse.json({ error: "Write the code first." }, { status: 400 });
  if (!(await uvAvailable())) {
    return NextResponse.json({ error: "uv isn't installed. Install it once: curl -LsSf https://astral.sh/uv/install.sh | sh" }, { status: 400 });
  }
  let sync = await uvSync(ctx.dir);
  let check = sync.ok ? await compile(ctx.dir) : { ok: false, output: sync.output };
  let repaired = false;
  let envVars = ctx.build.env_vars;

  if (!check.ok) {
    // Most failures are a bad tool body or a wrong package name — regenerate those once with the error.
    const logic = await generateLogic(ctx.design, ctx.spec, ctx.title, check.output);
    const { files } = await renderAgent({ projectId: params.id, title: ctx.title, design: ctx.design, spec: ctx.spec, logic });
    await writeCodebase(ctx.dir, files, "agent: automatic repair after install check");
    repaired = true;
    envVars = envVarsUsed(logic);
    ctx.build.logic = logic;
    sync = await uvSync(ctx.dir);
    check = sync.ok ? await compile(ctx.dir) : { ok: false, output: sync.output };
  }

  const build = { ...ctx.build, env_vars: envVars, install: { ok: check.ok, output: check.ok ? sync.output : check.output, at: new Date().toISOString(), repaired } };
  await saveBuild(params.id, ctx.phase, build);
  return NextResponse.json({ build }, { status: check.ok ? 200 : 422 });
}
