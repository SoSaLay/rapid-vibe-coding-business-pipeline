import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, latestArtifact } from "@/lib/store";
import { loadBuild } from "@/lib/agent/build-context";
import { getEvals } from "@/lib/agent/evals-state";
import { chosenHost, getDeploy } from "@/lib/agent/deploy";
import type { AgentDesign } from "@/lib/agent/design";

/**
 * The agent console's status line: what's live, and where a change is in its path
 * (design → build/apply → evaluations → release). Each step names its page.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  const draft = await getPhaseState<{ design?: AgentDesign; approved?: boolean }>(params.id, "agent-design");
  const evals = await getEvals(params.id);
  const deploy = await getDeploy(params.id);
  const lastRun = evals.runs[evals.runs.length - 1];
  const qa = await latestArtifact(params.id, "qa-report");
  const design = ctx.design;

  const builtVersion = ctx.build?.design_version ?? 0;
  const buildAt = ctx.build?.written_at ? Date.parse(ctx.build.written_at) : 0;
  const evalAt = lastRun ? Date.parse(lastRun.at) : 0;
  const datasetNewer = (evals.dataset_version ?? 0) > (lastRun?.summary.dataset_version ?? 0);
  const liveAt = deploy.production ? Date.parse(deploy.production.release.at) : 0;

  let next: { step: string; page: string; why: string } | null = null;
  if (draft?.design && !draft.approved) next = { step: "Approve the design", page: "agent-design", why: "You changed the design and haven't approved it yet." };
  else if (ctx.designVersion > builtVersion) next = { step: "Apply the changes", page: "engineering", why: "The approved design is newer than the built agent." };
  else if (buildAt > evalAt || datasetNewer) next = { step: "Run Evaluations", page: "qa", why: datasetNewer ? "New test cases were added." : "The agent changed since it was last evaluated." };
  else if (lastRun && !lastRun.passed) next = { step: "Fix the failing evaluation", page: "qa", why: "The last evaluation didn't pass the gate." };
  else if (evalAt > liveAt && lastRun?.passed) next = { step: "Release", page: "deployment", why: "A passing version isn't live yet." };

  return NextResponse.json({
    host: await chosenHost(params.id),
    login: design?.login?.selected ?? "machine-key",
    model: design?.model.selected,
    skills: (design?.skills ?? []).filter((s) => s.enabled).map((s) => s.name),
    knowledge: design?.knowledge?.mode ?? "none",
    knowledge_sources: design?.knowledge?.sources.length ?? 0,
    tools: (design?.tools ?? []).filter((t) => t.enabled).map((t) => t.name),
    memory: design?.memory.selected,
    live: deploy.production ? { release: deploy.production.release.id, at: deploy.production.release.at } : null,
    evaluated: lastRun ? { at: lastRun.at, passed: lastRun.passed, dataset: lastRun.summary.dataset_version } : null,
    // What failed in testing (the latest Evaluations run, or the live check of a release), for Failures to fix.
    eval_failures:
      lastRun && !lastRun.passed
        ? {
            at: lastRun.at,
            source: lastRun.source ?? "local",
            release: lastRun.release ?? null,
            rules: lastRun.gate.filter((g) => !g.ok).map((g) => `${g.label}: ${g.detail}`),
            cases: lastRun.summary.failing_cases.slice(0, 20),
          }
        : null,
    recorded_eval: !!qa,
    next,
  });
}
