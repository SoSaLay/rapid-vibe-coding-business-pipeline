/** Run the safety review on the current build and store it (keeps owner sign-offs on checks that still fail). */

import { promises as fs } from "fs";
import path from "path";
import { getPhaseState, savePhaseState } from "../store";
import { loadBuild } from "./build-context";
import { runSecurityReview, type SecurityReport } from "../phases/agent-security";

export async function runAndSaveSafetyReview(projectId: string): Promise<SecurityReport> {
  const ctx = await loadBuild(projectId);
  if (!ctx.design || !ctx.spec || !ctx.build) throw new Error("Build the agent first.");
  const files: Record<string, string> = {};
  for (const f of ctx.build.files) files[f.path] = await fs.readFile(path.join(ctx.dir, f.path), "utf8").catch(() => "");
  for (const extra of ["agent/prompt.py", "agent/tools.py", "agent/graph.py", ".gitignore"]) {
    if (!(extra in files)) files[extra] = await fs.readFile(path.join(ctx.dir, extra), "utf8").catch(() => "");
  }
  const report = await runSecurityReview({ design: ctx.design, spec: ctx.spec, files });
  report.design_version = ctx.build.design_version;
  const prev = (await getPhaseState<{ report?: SecurityReport }>(projectId, "security"))?.report;
  for (const c of report.checks) {
    const old = prev?.checks.find((p) => p.id === c.id);
    if (c.status === "fail" && old?.status === "exception") Object.assign(c, { status: "exception", exception_note: old.exception_note });
  }
  await savePhaseState(projectId, "security", { report });
  return report;
}
