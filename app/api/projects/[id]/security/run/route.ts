import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getPhaseState, savePhaseState } from "@/lib/store";
import { loadBuild } from "@/lib/agent/build-context";
import { runSecurityReview, type SecurityReport } from "@/lib/phases/agent-security";

/** Run the threat model + checklist against the approved design and the built code. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.design || !ctx.spec || !ctx.build) return NextResponse.json({ error: "Build the agent first." }, { status: 400 });
  const files: Record<string, string> = {};
  for (const f of ctx.build.files) {
    files[f.path] = await fs.readFile(path.join(ctx.dir, f.path), "utf8").catch(() => "");
  }
  try {
    const report = await runSecurityReview({ design: ctx.design, spec: ctx.spec, files });
    // Keep owner-signed exceptions across re-runs while the check still fails.
    const prev = (await getPhaseState<{ report?: SecurityReport }>(params.id, "security"))?.report;
    for (const c of report.checks) {
      const old = prev?.checks.find((p) => p.id === c.id);
      if (c.status === "fail" && old?.status === "exception") Object.assign(c, { status: "exception", exception_note: old.exception_note });
    }
    await savePhaseState(params.id, "security", { report });
    return NextResponse.json({ report }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Security review failed." }, { status: 500 });
  }
}
