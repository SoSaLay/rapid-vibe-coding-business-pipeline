import { NextRequest, NextResponse } from "next/server";
import { hostedBuilds } from "@/lib/agent/hosted/common";
import { tracked } from "@/lib/agent/activity";
import { promises as fs } from "fs";
import path from "path";
import { latestArtifact } from "@/lib/store";
import { loadBuild } from "@/lib/agent/build-context";
import { generateDataset, type Dataset } from "@/lib/phases/agent-evals";
import { writeCodebase } from "@/lib/phases/agent-engineering";
import { getEvals, saveEvals } from "@/lib/agent/evals-state";
import type { SecurityReport } from "@/lib/phases/agent-security";
import { getOps } from "@/lib/agent/ops";
import { applyCaseOverrides } from "@/lib/agent/test-cases";

/** What went wrong lately, for new cases to cover: open incidents and the latest failing test cases. */
async function recentProblems(projectId: string): Promise<string> {
  const lines: string[] = [];
  for (const i of (await getOps(projectId)).incidents.filter((x) => x.status === "open").slice(0, 10)) {
    lines.push(`- Incident (${i.severity}): ${i.title}. ${i.what_happened}`.slice(0, 600));
  }
  const runs = (await getEvals(projectId)).runs;
  for (const c of runs[runs.length - 1]?.summary.failing_cases.slice(0, 10) ?? []) lines.push(`- Failing case ${c.case} (${c.category}): ${c.reason}`.slice(0, 600));
  return lines.join("\n");
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * GET: the current dataset. POST: write a NEW version (regression from the example tests + new hard cases +
 * every case from real runs); earlier versions are kept under evals/versions/.
 * Body: { guidance?: string } — "Create custom test cases": the owner's brief. Without it, the new cases also
 * cover open incidents and the latest failures.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  const dataset = await readJson<Dataset>(path.join(ctx.dir, "evals", "dataset.json"));
  return NextResponse.json({ dataset });
}

async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  // Built our way, or on Claude / ChatGPT (their test cases live in the same folder).
  const hosted = Object.keys(await hostedBuilds(params.id)).length > 0;
  if (!ctx.design || !ctx.spec || (!ctx.build && !hosted)) return NextResponse.json({ error: "Build the agent first." }, { status: 400 });
  try {
    const examples = (await readJson<any[]>(path.join(ctx.dir, "tests", "examples.json"))) ?? [];
    const previous = await readJson<Dataset>(path.join(ctx.dir, "evals", "dataset.json"));
    const security = (await latestArtifact(params.id, "security-report"))?.payload as SecurityReport | undefined;
    const body = await req.json().catch(() => ({}));
    const guidance = typeof body.guidance === "string" ? body.guidance : "";
    const generated = await generateDataset({
      design: ctx.design,
      spec: ctx.spec,
      examples,
      threatModel: security?.threat_model ?? null,
      previous,
      problems: await recentProblems(params.id),
      guidance,
    });
    // Test cases the owner removed or corrected stay that way.
    const dataset = applyCaseOverrides(generated, (await getEvals(params.id)).case_overrides, examples);
    // Stopped by the owner while the cases were being written: keep the current ones.
    if (req.signal?.aborted) return NextResponse.json({ error: "Stopped." }, { status: 499 });
    await writeCodebase(
      ctx.dir,
      [
        { path: "evals/dataset.json", content: JSON.stringify(dataset, null, 2) + "\n", explains: "" },
        // Every version stays readable: v1 isn't lost when v2 is written.
        { path: `evals/versions/dataset.v${dataset.version}.json`, content: JSON.stringify(dataset, null, 2) + "\n", explains: "" },
        ...(previous ? [{ path: `evals/versions/dataset.v${previous.version}.json`, content: JSON.stringify(previous, null, 2) + "\n", explains: "" }] : []),
      ],
      `evals: dataset v${dataset.version} (${dataset.cases.length} cases)${guidance ? " — custom" : ""}`
    );
    const counts: Record<string, number> = {};
    for (const c of dataset.cases) counts[c.category] = (counts[c.category] ?? 0) + 1;
    const state = await getEvals(params.id);
    await saveEvals(params.id, { ...state, dataset_version: dataset.version, dataset_counts: counts });
    return NextResponse.json({ dataset }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to build the dataset." }, { status: 500 });
  }
}

export const POST = tracked("qa", "Writing test cases", handlePost);
