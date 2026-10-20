import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { tracked } from "@/lib/agent/activity";
import { loadBuild } from "@/lib/agent/build-context";
import { getDeploy } from "@/lib/agent/deploy";
import { getAutoflow, startAutoflow } from "@/lib/agent/autoflow";
import { changeAgent } from "@/lib/agent/fix";
import { fixAndVerify } from "@/lib/agent/fix-loop";
import { explainFailure } from "@/lib/agent/deploy-explain";
import type { Dataset } from "@/lib/phases/agent-evals";

/**
 * "Fix deployment": for the LATEST testing release only. Works out why it isn't passing and acts:
 *  - its live check failed → Engineering changes the agent (or corrects a test that is itself wrong),
 *    then re-tests it, and it's released and checked again;
 *  - its release failed → if the agent's code is the cause, the same; if it's the owner's setup (credits,
 *    a key, a sign-in) or the pipeline's, nothing is changed and the reply says what to do.
 * → { fixed, summary } or { needs_you: line } or { pipeline: line }.
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getDeploy(params.id);
  const stage = s.staging;
  const flow = await getAutoflow(params.id);
  const ctx = await loadBuild(params.id);

  let issue = "";
  let cases: Dataset["cases"] = [];

  if (stage && s.check?.release === stage.release.id && !s.check.passed) {
    // The latest release's live check.
    if (s.check.inconclusive) return NextResponse.json({ needs_you: s.check.inconclusive });
    const sum = s.check.summary;
    const ver = sum?.dataset_version;
    const current = await fs.readFile(path.join(ctx.dir, "evals", "dataset.json"), "utf8").then((t) => JSON.parse(t) as Dataset).catch(() => null);
    const used =
      current?.version === ver
        ? current
        : await fs.readFile(path.join(ctx.dir, "evals", "versions", `dataset.v${ver}.json`), "utf8").then((t) => JSON.parse(t) as Dataset).catch(() => current);
    const failing = new Set<string>((sum?.failing_cases ?? []).map((c: any) => c.case));
    cases = (used?.cases ?? []).filter((c) => failing.has(c.id));
    issue =
      `THE DEPLOYED TESTING AGENT (release ${stage.release.id}) FAILED ITS LIVE CHECK.\n` +
      `Rules not met: ${s.check.gate.filter((g) => !g.ok).map((g) => `${g.label} (${g.detail})`).join("; ")}\n` +
      `Failing cases:\n${(sum?.failing_cases ?? []).map((c: any) => `- ${c.case} (${c.category}): ${c.reason}`).join("\n")}`;
  } else {
    // The latest release attempt failed (GitHub's run, or a release from here).
    const err = flow?.stage === "failed" && flow.error ? { error: `${flow.message} ${flow.error}`, log: "" } : s.last_event && !s.last_event.ok ? { error: s.last_event.error ?? "", log: s.last_event.log ?? "" } : null;
    if (!err) return NextResponse.json({ error: "The latest testing release has no failure to fix." }, { status: 400 });
    const who = s.last_event && !s.last_event.ok && s.last_event.plain ? s.last_event.plain : await explainFailure(err.error, err.log);
    if (who.who === "you") return NextResponse.json({ needs_you: who.line });
    if (who.who === "pipeline") return NextResponse.json({ pipeline: who.line });
    issue = `THE TESTING RELEASE FAILED BECAUSE OF THE AGENT'S CODE: ${who.line}\nError: ${err.error}\nOutput (end):\n${err.log.slice(-4000)}`;
  }

  try {
    // With failing cases: fix, re-run exactly those cases, retry up to 3 times. A release error: one fix.
    const r = cases.length
      ? await fixAndVerify({ projectId: params.id, issue, cases })
      : await changeAgent({ projectId: params.id, issue, kind: "quality", keepTests: false }).then((x) => ({ ...x, verified: false, tries: 1, release: x.fixed }));
    // Engineering re-tests and re-reviews the change, then it's released and checked (or waits for Deploy now).
    if (r.release) startAutoflow(params.id, req.nextUrl.origin, r.version ?? undefined, { codeReady: true });
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't fix the deployment." }, { status: 400 });
  }
}

export const POST = tracked("engineering", "Fixing the deployment", handlePost);
