import { NextRequest, NextResponse } from "next/server";
import { loadBuild, saveBuild } from "@/lib/agent/build-context";
import { CHECK_SUMMARY_VERSION, summarizeChecks } from "@/lib/phases/agent-engineering";
import { attributed } from "@/lib/agent/activity";

/** Backfill plain check titles/results for test runs made before they existed. */
async function handlePost(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  const tests = ctx.build?.tests;
  if (!ctx.build || !tests || !ctx.design) return NextResponse.json({ error: "Run the checks first." }, { status: 400 });
  if (tests.summarized === CHECK_SUMMARY_VERSION) return NextResponse.json({ build: ctx.build });
  try {
    const plain = await summarizeChecks({ agentSummary: ctx.design.summary, examples: tests.examples, failed: tests.failed, output: tests.output });
    const build = { ...ctx.build, tests: { ...tests, examples: plain.examples, note: plain.note, summarized: CHECK_SUMMARY_VERSION } };
    await saveBuild(params.id, ctx.phase, build);
    return NextResponse.json({ build });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't summarize." }, { status: 400 });
  }
}

export const POST = attributed(handlePost);
