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
export function startDeploy(projectId: string, origin: string) {
  if (running.has(projectId)) return false;
  running.add(projectId);
  deploy(projectId, origin)
    .catch(async (e) => set(projectId, { stage: "failed", phase: null, message: "Deploying failed.", error: String(e?.message ?? e) }))
    .finally(() => running.delete(projectId));
  return true;
}

async function deploy(projectId: string, origin: string) {
  const token = await githubToken();
  if (!token) throw new Error("Connect GitHub in onboarding first.");
  const prev = await getAutoflow(projectId);
  const unpushed = (await githubStatus(projectId)).unpushed;
  await set(projectId, { stage: "pushing", phase: "deployment", message: "Pushing your latest changes to GitHub…", error: undefined, run_url: undefined });
  const pushed = await pushAgent(projectId);
  if (!pushed.ok) throw new Error(pushed.error || "Pushing to GitHub failed.");
  // Nothing new to push (a retry): re-run the last run's failed jobs instead.
  const runId = /\/actions\/runs\/(\d+)/.exec(prev?.run_url ?? "")?.[1];
  if (!unpushed && runId) {
    const repo = (await githubStatus(projectId)).repo;
    await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "rapid-vibe-coding-pipeline" },
    });
  }
  await set(projectId, { stage: "deploying", message: "Deploying your latest changes: GitHub is testing and releasing them…" });
  await followRun(projectId, token, origin);
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
  await deploy(projectId, origin);
}

/** Follow the GitHub Actions run for the pushed commit until it finishes (up to ~25 minutes). */
async function followRun(projectId: string, token: string, origin: string) {
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
        await set(projectId, { message: "GitHub released your changes. Checking the new test copy…" });
        await set(projectId, { stage: "deployed", phase: null, message: await recordAndCheck(projectId, origin) });
      } else {
        await set(projectId, { stage: "failed", phase: null, ...(await explainRun(status.repo, r.id, headers)) });
      }
      return;
    }
  }
  await set(projectId, { stage: "failed", phase: null, message: "GitHub is taking too long.", error: "Open the GitHub run to see where it is." });
}

/**
 * GitHub released a new staging version: record it in Deployment (so Technical output and Release
 * history show it), then run the live check against it. Returns the plain outcome.
 */
async function recordAndCheck(projectId: string, origin: string): Promise<string> {
  const s = await syncGithubRelease(projectId);
  if (!s.staging) return "Changes deployed: tests and evals passed on GitHub, and the test copy is updated.";
  const c = await call(origin, projectId, "deploy/check");
  const check = c.d.check;
  if (!c.ok || !check) return `Changes deployed, but the live check couldn't run${c.d.error ? `: ${c.d.error}` : "."}`;
  if (check.inconclusive) return `Changes deployed, but the live check couldn't score them: ${check.inconclusive}`;
  return check.passed ? "Changes deployed and the test copy passed its live check." : "Changes deployed, but the test copy failed its live check. See Technical output.";
}

/**
 * If GitHub's agent-ci released a newer push than the staging release on record, record that release
 * (version + target from the host). Safe to call any time; returns the current deploy state.
 */
export async function syncGithubRelease(projectId: string) {
  const { getProjectSettings } = await import("../store");
  const { loadBuild } = await import("./build-context");
  const { chosenHost, getDeploy, hostCredentials, saveDeploy } = await import("./deploy");
  const { currentStaging } = await import("./adapters/runtime");
  const s = await getDeploy(projectId);
  const gh = (await getProjectSettings(projectId)).agentGithub;
  if (!gh?.pushed_sha || !gh.pushed_at) return s;
  if (s.staging && s.staging.release.at >= gh.pushed_at) return s; // already newer than the last push
  const short = gh.pushed_sha.slice(0, 7);
  if (s.staging && gh.pushed_sha.startsWith(s.staging.release.commit)) return s;
  // Only if GitHub's run for that push actually released.
  const token = await githubToken();
  if (!token) return s;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "rapid-vibe-coding-pipeline" };
  const j: any = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/actions/runs?head_sha=${gh.pushed_sha}&per_page=5`, { headers }).then((r) => r.json()).catch(() => null);
  const run = (j?.workflow_runs ?? []).find((r: any) => r.name === "agent-ci");
  if (run?.status !== "completed" || run.conclusion !== "success") return s;
  const host = await chosenHost(projectId);
  const creds = await hostCredentials(host);
  if (!creds) return s;
  const now = await currentStaging(host, (await loadBuild(projectId)).dir, creds, s.railway_urls);
  if (!now) return s;
  // agent-ci names the release after the short commit (its RELEASE file).
  const release = { id: short, commit: short, at: run.updated_at ?? new Date().toISOString(), env: "staging" as const, version: now.version, ok: true, log: `Released by GitHub (agent-ci): ${run.html_url}` };
  const next = { ...s, host, staging: { release, target: now.target }, history: [...s.history.filter((h) => h.id !== short), release].slice(-30) };
  await saveDeploy(projectId, next);
  return next;
}

/** Which GitHub job and step failed, in plain words, and who needs to act. */
async function explainRun(repo: string, runId: number, headers: Record<string, string>): Promise<{ message: string; error: string }> {
  const j: any = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`, { headers }).then((r) => r.json()).catch(() => null);
  const jobs: any[] = j?.jobs ?? [];
  const failed = jobs.find((x) => x.conclusion === "failure");
  const step: string = failed?.steps?.find((x: any) => x.conclusion === "failure")?.name ?? "";
  const testsOk = jobs.some((x) => x.name === "test" && x.conclusion === "success");
  if (!failed) return { message: "GitHub's run didn't finish.", error: "Open it on GitHub for details." };
  if (failed.name === "test") {
    return { message: "GitHub's tests failed on the new version.", error: "Agent code: fix the failing tests in Evaluations, then deploy again." };
  }
  if (/credential|aws-actions|configure-aws/i.test(step)) {
    return {
      message: `${testsOk ? "Tests passed, but " : ""}GitHub couldn't sign in to AWS to release.`,
      error: "Pipeline issue: deploy again and the pipeline sets up GitHub's AWS access first.",
    };
  }
  if (/railway/i.test(step)) {
    return { message: `${testsOk ? "Tests passed, but " : ""}the release to Railway failed.`, error: "You need to: check the Railway token in onboarding." };
  }
  return {
    message: `${testsOk ? "Tests passed, but " : ""}the ${failed.name} step "${step || "unknown"}" failed.`,
    error: "Open it on GitHub for the details.",
  };
}
