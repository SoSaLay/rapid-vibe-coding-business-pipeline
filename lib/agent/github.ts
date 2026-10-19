/**
 * GitHub for built agents: each agent's code is pushed to its own private repo, so the
 * workflows already in it (agent-ci: tests + evals, release to staging; agent-ops: hourly
 * alerts, daily scoring) run in the cloud. The pipeline commits every change locally; this
 * module tracks what isn't on GitHub yet and pushes it, either when the owner says so or
 * automatically (their choice, kept globally in data/connectors/github-push.json).
 *
 * Auth: the token saved in onboarding (data/connectors/github.json, GITHUB_TOKEN / GH_TOKEN),
 * else this Mac's GitHub CLI sign-in (`gh auth token`). The token is passed per command and
 * never written into the repo's remote.
 */

import { createHash } from "crypto";
import { getGithubToken } from "../github/import";
import { readConnectorConfig, saveConnectorConfig } from "../connectors/config";
import { getProjectSettings, saveProjectSettings } from "../store";
import { loadBuild } from "./build-context";
import { agentEnv } from "./env";
import { awsEnv } from "./aws";
import { chosenHost, hostCredentials } from "./deploy";
import { credentialsAdapter } from "./registry";
import { sh } from "./proc";

export type PushMode = "ask" | "auto";

interface RepoState {
  owner: string;
  repo: string;
  pushed_sha?: string;
  pushed_at?: string;
  /** sha256 of each secret value last sent, so unchanged secrets aren't re-sent. */
  secret_hashes?: Record<string, string>;
}

const API = "https://api.github.com";

export async function githubToken(): Promise<string | null> {
  const saved = await getGithubToken();
  if (saved) return saved;
  const r = await sh("gh", ["auth", "token"], { cwd: process.cwd(), timeoutMs: 10_000 }).catch(() => null);
  const t = r?.ok ? r.out.trim().split("\n").pop()?.trim() : "";
  return t && /^[\w-]{20,}$/.test(t) ? t : null;
}

export async function pushMode(): Promise<PushMode | null> {
  const m = (await readConnectorConfig("github-push"))?.mode;
  return m === "ask" || m === "auto" ? m : null;
}

export async function setPushMode(mode: PushMode): Promise<void> {
  await saveConnectorConfig("github-push", { mode });
}

const gh = (token: string, p: string, init: RequestInit = {}) =>
  fetch(`${API}${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "rapid-vibe-coding-pipeline", ...(init.headers ?? {}) },
  });

async function repoState(projectId: string): Promise<RepoState | null> {
  return (await getProjectSettings(projectId)).agentGithub ?? null;
}
async function saveRepoState(projectId: string, s: RepoState) {
  await saveProjectSettings(projectId, { agentGithub: s });
}

/** How far the agent's local code is ahead of GitHub. */
export async function githubStatus(projectId: string) {
  const ctx = await loadBuild(projectId);
  const [token, mode, repo] = await Promise.all([githubToken(), pushMode(), repoState(projectId)]);
  if (!ctx.build) return { built: false, connected: !!token, mode, repo: null, unpushed: 0 };
  const head = (await sh("git", ["rev-parse", "HEAD"], { cwd: ctx.dir })).out.trim();
  let unpushed = 0;
  if (head && head !== repo?.pushed_sha) {
    const known = repo?.pushed_sha && (await sh("git", ["cat-file", "-e", `${repo.pushed_sha}^{commit}`], { cwd: ctx.dir })).ok;
    const r = await sh("git", ["rev-list", "--count", known ? `${repo!.pushed_sha}..HEAD` : "HEAD"], { cwd: ctx.dir });
    unpushed = Number(r.out.trim()) || 0;
  }
  return {
    built: true,
    connected: !!token,
    mode,
    repo: repo ? `${repo.owner}/${repo.repo}` : null,
    url: repo ? `https://github.com/${repo.owner}/${repo.repo}` : null,
    unpushed,
    pushed_at: repo?.pushed_at ?? null,
  };
}

/** The repo secrets the agent's workflows read, from the keys the pipeline already has. */
async function workflowSecrets(projectId: string): Promise<Record<string, string>> {
  const ctx = await loadBuild(projectId);
  if (!ctx.design) return {};
  const env = await agentEnv(projectId, ctx.design, ctx.slug);
  const creds = await (await credentialsAdapter(projectId)).envFor(projectId);
  const out: Record<string, string> = {};
  for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DATABASE_URL"]) if (env[k] || creds[k]) out[k] = env[k] || creds[k];
  const host = await chosenHost(projectId);
  if (host === "railway") {
    const h = await hostCredentials("railway");
    if (h?.RAILWAY_TOKEN_STAGING) out.RAILWAY_TOKEN_STAGING = h.RAILWAY_TOKEN_STAGING;
  } else {
    // GitHub can't use this Mac's AWS CLI sign-in: only pasted access keys can go to GitHub.
    const a = await awsEnv();
    if (a?.AWS_ACCESS_KEY_ID) Object.assign(out, { AWS_ACCESS_KEY_ID: a.AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: a.AWS_SECRET_ACCESS_KEY });
  }
  return out;
}

/** Push the agent's code to its private GitHub repo (creating it the first time) and sync its secrets. */
export async function pushAgent(projectId: string): Promise<{ ok: boolean; url?: string; pushed?: number; note?: string; error?: string }> {
  const token = await githubToken();
  if (!token) return { ok: false, error: "Connect GitHub in onboarding first." };
  const ctx = await loadBuild(projectId);
  if (!ctx.build) return { ok: false, error: "Build the agent first." };

  let repo = await repoState(projectId);
  if (!repo) {
    const me: any = await gh(token, "/user").then((r) => r.json()).catch(() => null);
    if (!me?.login) return { ok: false, error: "GitHub didn't accept the token." };
    repo = { owner: me.login, repo: ctx.slug };
  }
  const exists = await gh(token, `/repos/${repo.owner}/${repo.repo}`);
  if (exists.status === 404) {
    const made = await gh(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({ name: repo.repo, private: true, description: `AI agent: ${ctx.title}` }),
    });
    if (!made.ok) {
      const j: any = await made.json().catch(() => ({}));
      return { ok: false, error: `GitHub couldn't create the repo: ${j?.message || made.status}` };
    }
  } else if (!exists.ok) {
    return { ok: false, error: `GitHub error ${exists.status} reading the repo.` };
  }

  const before = await githubStatus(projectId);
  const auth = Buffer.from(`x-access-token:${token}`).toString("base64");
  const push = await sh(
    "git",
    ["-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${auth}`, "push", `https://github.com/${repo.owner}/${repo.repo}.git`, "HEAD:refs/heads/main"],
    { cwd: ctx.dir, timeoutMs: 3 * 60_000 },
  );
  if (!push.ok) return { ok: false, error: `Push failed: ${push.out.replaceAll(token, "***").replaceAll(auth, "***").slice(-600)}` };
  const head = (await sh("git", ["rev-parse", "HEAD"], { cwd: ctx.dir })).out.trim();

  // Secrets for the workflows, via the GitHub CLI (it does the required encryption). Only changed values are sent.
  let note: string | undefined;
  const secrets = await workflowSecrets(projectId);
  const hashes = { ...(repo.secret_hashes ?? {}) };
  const haveGh = (await sh("gh", ["--version"], { cwd: ctx.dir, timeoutMs: 10_000 })).ok;
  if (Object.keys(secrets).length && !haveGh) note = "Install the GitHub CLI (gh) so the pipeline can set the repo's secrets.";
  for (const [k, v] of Object.entries(secrets)) {
    const h = createHash("sha256").update(v).digest("hex");
    if (!haveGh || hashes[k] === h) continue;
    const r = await sh("sh", ["-c", `printf %s "$SECRET_VALUE" | gh secret set ${k} --repo ${repo.owner}/${repo.repo}`], {
      cwd: ctx.dir,
      env: { GH_TOKEN: token, SECRET_VALUE: v },
      timeoutMs: 60_000,
    });
    if (r.ok) hashes[k] = h;
  }
  if (haveGh && (await chosenHost(projectId)) === "agentcore") {
    // The release job reads the region from a repo variable.
    const region = (await awsEnv())?.AWS_REGION || "us-east-1";
    await sh("gh", ["variable", "set", "AWS_REGION", "--body", region, "--repo", `${repo.owner}/${repo.repo}`], { cwd: ctx.dir, env: { GH_TOKEN: token }, timeoutMs: 60_000 });
  }
  if ((await chosenHost(projectId)) === "agentcore" && !secrets.AWS_ACCESS_KEY_ID) {
    note = "Code is on GitHub. For GitHub to release to AWS by itself, add AWS access keys in onboarding (your Mac's AWS sign-in stays on your Mac).";
  }

  await saveRepoState(projectId, { ...repo, pushed_sha: head, pushed_at: new Date().toISOString(), secret_hashes: hashes });
  return { ok: true, url: `https://github.com/${repo.owner}/${repo.repo}`, pushed: before.unpushed, note };
}
