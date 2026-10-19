/**
 * Autoflow: after an approved change to a BUILT agent's design, the pipeline carries it through
 * on its own, in the background on this server:
 *   1. Engineering — update the code (quick re-render, or a full rewrite when the tools changed),
 *      install, run the tests and the safety review.
 *   2. Deployment — if the owner chose "always push automatically" and GitHub is connected, push;
 *      GitHub's agent-ci workflow then re-runs the tests and evals and releases a staging copy.
 *      The run is followed until it finishes. Otherwise the changes wait in Deployment for the
 *      owner's "Push & deploy".
 * The steps call the same routes the pages use (one code path); progress lives in phase state
 * "autoflow" so every page and the sidebar can show it.
 */

import { getPhaseState, savePhaseState } from "../store";
import { githubStatus, githubToken, pushAgent, pushMode } from "./github";

export type AutoflowStage = "building" | "testing" | "reviewing" | "pushing" | "deploying" | "ready" | "deployed" | "failed";

export interface AutoflowState {
  stage: AutoflowStage;
  /** Which part of the pipeline is working, for the sidebar. */
  phase: "engineering" | "deployment" | null;
  message: string;
  design_version?: number;
  started_at: string;
  updated_at: string;
  error?: string;
  /** GitHub Actions run for the pushed commit. */
  run_url?: string;
}

// Shared across route bundles (Next can load this module more than once in one server process).
const g = globalThis as unknown as { __autoflow?: { running: Set<string>; queued: Map<string, { origin: string; designVersion?: number }> } };
g.__autoflow ??= { running: new Set(), queued: new Map() };
const running = g.__autoflow.running;
const queued = g.__autoflow.queued;

export async function getAutoflow(projectId: string): Promise<AutoflowState | null> {
  return (await getPhaseState<AutoflowState>(projectId, "autoflow" as any)) ?? null;
}

async function set(projectId: string, patch: Partial<AutoflowState>) {
  const prev = (await getAutoflow(projectId)) ?? ({ started_at: new Date().toISOString() } as AutoflowState);
  await savePhaseState(projectId, "autoflow" as any, { ...prev, ...patch, updated_at: new Date().toISOString() });
}

/** Deployment only: push what's built and follow GitHub's run (the owner's "Push & deploy"). */
export function startDeploy(projectId: string) {
  if (running.has(projectId)) return false;
  running.add(projectId);
  deploy(projectId)
    .catch(async (e) => set(projectId, { stage: "failed", phase: null, message: "Deploying failed.", error: String(e?.message ?? e) }))
    .finally(() => running.delete(projectId));
  return true;
}

async function deploy(projectId: string) {
  const token = await githubToken();
  if (!token) throw new Error("Connect GitHub in onboarding first.");
  await set(projectId, { stage: "pushing", phase: "deployment", message: "Pushing your latest changes to GitHub…", error: undefined, run_url: undefined });
  const pushed = await pushAgent(projectId);
  if (!pushed.ok) throw new Error(pushed.error || "Pushing to GitHub failed.");
  await set(projectId, { stage: "deploying", message: "Deploying your latest changes: GitHub is testing and releasing them…" });
  await followRun(projectId, token);
}

/** Start (or restart) the flow for a project. `origin` is this server's base URL, so steps reuse the API routes. */
export function startAutoflow(projectId: string, origin: string, designVersion?: number, opts: { codeReady?: boolean } = {}) {
  if (running.has(projectId)) {
    // A newer change arrived mid-run: run again once the current one finishes.
    queued.set(projectId, { origin, designVersion });
    return;
  }
  running.add(projectId);
  run(projectId, origin, designVersion, opts.codeReady)
    .catch(async (e) => set(projectId, { stage: "failed", phase: null, message: "Something went wrong.", error: String(e?.message ?? e) }))
    .finally(() => {
      running.delete(projectId);
      const next = queued.get(projectId);
      if (next) {
        queued.delete(projectId);
        startAutoflow(projectId, next.origin, next.designVersion);
      }
    });
}

export function isAutoflowRunning(projectId: string) {
  return running.has(projectId);
}

async function call(origin: string, projectId: string, step: string, body: unknown = {}) {
  const res = await fetch(`${origin}/api/projects/${projectId}/${step}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, d };
}

/** `codeReady`: the code was already changed (an Evaluations Fix it), so start at the tests. */
async function run(projectId: string, origin: string, designVersion?: number, codeReady = false) {
  await savePhaseState(projectId, "autoflow" as any, {
    stage: codeReady ? "testing" : "building",
    phase: "engineering",
    message: codeReady ? "Re-checking your agent after the fix: running the tests…" : "Building the latest changes you made in Agent Design…",
    design_version: designVersion,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies AutoflowState);

  // 1. Engineering: quick update, or a full rewrite when the tools changed.
  const refresh = codeReady ? { ok: true, status: 200, d: {} } : await call(origin, projectId, "agent-build/refresh");
  if (refresh.status === 409) {
    const write = await call(origin, projectId, "agent-build/write");
    if (!write.ok) throw new Error(write.d.error || "Writing the code failed.");
    const install = await call(origin, projectId, "agent-build/install");
    if (!install.ok) throw new Error(install.d.error || "Installing failed.");
  } else if (!refresh.ok) {
    throw new Error(refresh.d.error || "Updating the code failed.");
  }
  await set(projectId, { stage: "testing", message: "Running the tests on your latest changes…" });
  const test = await call(origin, projectId, "agent-build/test");
  if (!test.ok) throw new Error(test.d.error || "The tests couldn't run.");
  await set(projectId, { stage: "reviewing", message: "Reviewing the safety of your latest changes…" });
  const review = await call(origin, projectId, "agent-build/review");
  if (!review.ok) throw new Error(review.d.error || "The safety review couldn't run.");

  // 2. Deployment.
  const [mode, token] = await Promise.all([pushMode(), githubToken()]);
  if (mode !== "auto" || !token) {
    await set(projectId, { stage: "ready", phase: null, message: "Your latest changes are built and ready to deploy." });
    return;
  }
  await deploy(projectId);
}

/** Follow the GitHub Actions run for the pushed commit until it finishes (up to ~25 minutes). */
async function followRun(projectId: string, token: string) {
  const status = await githubStatus(projectId);
  if (!status.repo) throw new Error("No GitHub repo.");
  const { sh } = await import("./proc");
  const { loadBuild } = await import("./build-context");
  const sha = (await sh("git", ["rev-parse", "HEAD"], { cwd: (await loadBuild(projectId)).dir })).out.trim();
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "rapid-vibe-coding-pipeline" };
  const deadline = Date.now() + 25 * 60_000;
  let seen = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15_000));
    const j: any = await fetch(`https://api.github.com/repos/${status.repo}/actions/runs?head_sha=${sha}&per_page=5`, { headers })
      .then((r) => r.json())
      .catch(() => null);
    const runs: any[] = (j?.workflow_runs ?? []).filter((r: any) => r.name === "agent-ci");
    const r = runs[0];
    if (!r) {
      // No workflow in the repo yet (the agent hasn't been packaged for deployment).
      if (!seen && Date.now() > deadline - 23 * 60_000) {
        await set(projectId, { stage: "deployed", phase: null, message: "Pushed to GitHub. Package the agent in Deployment to turn on automatic releases." });
        return;
      }
      continue;
    }
    seen = true;
    await set(projectId, { run_url: r.html_url });
    if (r.status === "completed") {
      if (r.conclusion === "success") {
        await set(projectId, { stage: "deployed", phase: null, message: "Changes deployed: tests and evals passed, and the test copy is updated." });
      } else {
        await set(projectId, { stage: "failed", phase: null, message: "GitHub's checks or release failed.", error: `GitHub run ${r.conclusion}. Open it for details.` });
      }
      return;
    }
  }
  await set(projectId, { stage: "failed", phase: null, message: "GitHub is taking too long.", error: "Open the GitHub run to see where it is." });
}
