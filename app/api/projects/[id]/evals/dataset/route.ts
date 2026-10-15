import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { latestArtifact } from "@/lib/store";
import { loadBuild } from "@/lib/agent/build-context";
import { generateDataset, type Dataset } from "@/lib/phases/agent-evals";
import { writeCodebase } from "@/lib/phases/agent-engineering";
import { getEvals, saveEvals } from "@/lib/agent/evals-state";
import type { SecurityReport } from "@/lib/phases/agent-security";

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** GET: the current dataset. POST: write a new version (regression from the example tests + new hard cases). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  const dataset = await readJson<Dataset>(path.join(ctx.dir, "evals", "dataset.json"));
  return NextResponse.json({ dataset });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.design || !ctx.spec || !ctx.build) return NextResponse.json({ error: "Build the agent first." }, { status: 400 });
  try {
    const examples = (await readJson<any[]>(path.join(ctx.dir, "tests", "examples.json"))) ?? [];
    const previous = await readJson<Dataset>(path.join(ctx.dir, "evals", "dataset.json"));
    const security = (await latestArtifact(params.id, "security-report"))?.payload as SecurityReport | undefined;
    const dataset = await generateDataset({ design: ctx.design, spec: ctx.spec, examples, threatModel: security?.threat_model ?? null, previous });
    await writeCodebase(
      ctx.dir,
      [{ path: "evals/dataset.json", content: JSON.stringify(dataset, null, 2) + "\n", explains: "" }],
      `evals: dataset v${dataset.version} (${dataset.cases.length} cases)`
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
