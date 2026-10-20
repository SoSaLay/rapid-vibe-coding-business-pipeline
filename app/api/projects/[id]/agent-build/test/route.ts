import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { promises as fs } from "fs";
import path from "path";
import { loadBuild, saveBuild } from "@/lib/agent/build-context";
import { unitTestAdapter } from "@/lib/agent/registry";
import { agentEnv, renderDotEnv } from "@/lib/agent/env";
import { modelKeyEnv } from "@/lib/agent/design";
import { CHECK_SUMMARY_VERSION, readExampleResults, summarizeChecks } from "@/lib/phases/agent-engineering";
import { usageCostUsd } from "@/lib/agent/pricing";
import { recordSpend } from "@/lib/agent/spend";

/** Step 3: tool checks + the example tasks, in dry run (write tools never execute). */
async function handlePost(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.build?.install?.ok || !ctx.design) return NextResponse.json({ error: "Install the agent first." }, { status: 400 });
  const env = await agentEnv(params.id, ctx.design, ctx.slug);
  // Keys may have been added since the code was written.
  await fs.writeFile(path.join(ctx.dir, ".env"), renderDotEnv(env), { mode: 0o600 });
  const run = await (await unitTestAdapter(params.id)).run({ dir: ctx.dir, env: { ...env, AGENT_DRY_RUN: "1" } });
  const raw = await readExampleResults(ctx.dir);
  // The example tasks ran through the agent's model and were graded: that's testing spend.
  const rows: any[] = await fs.readFile(path.join(ctx.dir, ".results", "examples.json"), "utf8").then((t) => JSON.parse(t)).catch(() => []);
  const judge = env.EVAL_JUDGE_MODEL || ctx.design.model.selected;
  const spent = rows.reduce(
    (a, r) =>
      a +
      (usageCostUsd(ctx.design!.model.selected, r.result?.usage, ctx.design!.model_price) ?? 0) +
      (usageCostUsd(judge, r.judge_usage, judge === ctx.design!.model.selected ? ctx.design!.model_price : undefined) ?? 0),
    0,
  );
  await recordSpend(params.id, "engineering tests", spent);
  // Plain titles + one-line results for the owner. Optional: raw results still show if this fails.
  const plain = await summarizeChecks({ agentSummary: ctx.design.summary, examples: raw, failed: run.failed, output: run.output }).catch(() => null);
  const tests = {
    ...run,
    examples: plain?.examples ?? raw,
    note: plain?.note ?? "",
    summarized: plain ? CHECK_SUMMARY_VERSION : false,
    skipped_examples: !!modelKeyEnv(ctx.design.model.selected) && !env[modelKeyEnv(ctx.design.model.selected)],
    at: new Date().toISOString(),
  };
  const build = { ...ctx.build, tests };
  await saveBuild(params.id, ctx.phase, build);
  return NextResponse.json({ build });
}

export const POST = tracked("engineering", "Running the tests", handlePost);
