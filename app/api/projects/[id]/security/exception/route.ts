import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, savePhaseState } from "@/lib/store";
import type { SecurityReport } from "@/lib/phases/agent-security";

/** Owner signs off a failing check with a written reason. Body: { id, note } (empty note withdraws it). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const state = await getPhaseState<{ report?: SecurityReport }>(params.id, "security");
  const check = state?.report?.checks.find((c) => c.id === body.id);
  if (!state?.report || !check) return NextResponse.json({ error: "No such check." }, { status: 404 });
  const note = String(body.note ?? "").trim();
  if (note && check.status === "fail") Object.assign(check, { status: "exception", exception_note: note });
  else if (!note && check.status === "exception") Object.assign(check, { status: "fail", exception_note: undefined });
  await savePhaseState(params.id, "security", state);
  return NextResponse.json({ report: state.report });
}
