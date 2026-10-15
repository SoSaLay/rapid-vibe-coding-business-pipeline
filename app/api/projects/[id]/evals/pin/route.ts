import { NextRequest, NextResponse } from "next/server";
import { getEvals, saveEvals } from "@/lib/agent/evals-state";

/** Pin the latest passing run as the new baseline (e.g. after a deliberate improvement). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await getEvals(params.id);
  const last = state.runs[state.runs.length - 1];
  if (!last?.passed) return NextResponse.json({ error: "Only a passing run can become the baseline." }, { status: 400 });
  await saveEvals(params.id, { ...state, baseline: last.summary, baseline_at: last.at });
  return NextResponse.json({ ok: true });
}
