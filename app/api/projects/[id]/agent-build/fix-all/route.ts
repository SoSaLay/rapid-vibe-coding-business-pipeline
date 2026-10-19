import { NextRequest, NextResponse } from "next/server";
import { getPhaseState } from "@/lib/store";
import { fixSafetyIssue, type FixTarget } from "@/lib/agent/fix";
import type { SecurityReport } from "@/lib/phases/agent-security";

/** Fix every red item on the safety checklist, one after another (each fix builds on the last). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const report = (await getPhaseState<{ report?: SecurityReport }>(params.id, "security"))?.report;
  if (!report) return NextResponse.json({ error: "Run the safety review first." }, { status: 400 });
  const targets: FixTarget[] = [
    ...report.checks.filter((c) => c.status === "fail").map((c) => ({ kind: "check" as const, id: c.id })),
    ...report.threat_model.entry_points.map((e, i) => ({ e, i })).filter(({ e }) => !e.mitigated).map(({ i }) => ({ kind: "threat" as const, index: i })),
  ];
  const results: { fixed: boolean; summary: string }[] = [];
  for (const t of targets) {
    // An earlier fix may already have closed this one (e.g. the injection check closes its threats).
    const now = (await getPhaseState<{ report?: SecurityReport }>(params.id, "security"))?.report;
    const open = t.kind === "check" ? now?.checks.find((c) => c.id === t.id)?.status === "fail" : now?.threat_model.entry_points[t.index]?.mitigated === false;
    if (!open) continue;
    try {
      const r = await fixSafetyIssue(params.id, t);
      results.push({ fixed: r.fixed, summary: r.summary });
    } catch (e: any) {
      results.push({ fixed: false, summary: e?.message || "Couldn't fix this one." });
    }
  }
  return NextResponse.json({ results });
}
