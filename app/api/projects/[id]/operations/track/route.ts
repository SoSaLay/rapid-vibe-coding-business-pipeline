import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState } from "@/lib/store";
import { OpsReport, CheckLog } from "@/lib/phases/operations";

/**
 * Check an item off (done=true stamps now; done=false clears it).
 * The cadence timer in the UI derives due/reset state from the timestamp.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const itemId: string | undefined = body.itemId;
  const done: boolean = body.done !== false;
  if (!itemId) return NextResponse.json({ error: "itemId is required." }, { status: 400 });

  const state = await getPhaseState<any>(params.id, "operations");
  const report: OpsReport | undefined = state?.report;
  if (!report) return NextResponse.json({ error: "No ops report yet — generate it first." }, { status: 400 });

  const valid = report.tools.some((t) => t.checks.some((c) => c.id === itemId));
  if (!valid) return NextResponse.json({ error: "Unknown checklist item." }, { status: 400 });

  const checkLog: CheckLog = { ...(state.checkLog ?? {}) };
  if (done) checkLog[itemId] = new Date().toISOString();
  else delete checkLog[itemId];

  await savePhaseState(params.id, "operations", { ...state, checkLog });
  return NextResponse.json({ checkLog }, { status: 200 });
}
