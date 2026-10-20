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
import { ciAccess } from "./ci-access";
import { chosenHost, deployEnv, getDeploy, hostCredentials } from "./deploy";
import { deployFiles } from "./adapters/deploy-files";
import { promises as fs } from "fs";
import path from "path";
import { credentialsAdapter } from "./registry";
import { sh } from "./proc";

export type PushMode = "ask" | "auto";

interface RepoState {
  owner: string;
  repo: string;
  /** The host GitHub was given deploy access to (set once by the CI access slot). */
  ci?: string;
  pushed_sha?: string;
  pushed_at?: string;
  /** sha256 of each secret value last sent, so unchanged secrets aren't re-sent. */
  secret_hashes?: Record<string, string>;
}

const API = "https://api.github.com";

// The gh CLI's answer, kept a minute: asking it takes ~0.3s and every page refresh needs it.
const ghCli = globalThis as unknown as { __ghToken?: { at: number; token: string | null } };

export async function githubToken(): Promise<string | null> {
  const saved = await getGithubToken();
  if (saved) return saved;
  if (ghCli.__ghToken && Date.now() - ghCli.__ghToken.at < 60_000) return ghCli.__ghToken.token;
  const r = await sh("gh", ["auth", "token"], { cwd: process.cwd(), timeoutMs: 10_000 }).catch(() => null);
  const t = r?.ok ? r.out.trim().split("\n").pop()?.trim() : "";
  const token = t && /^[\w-]{20,}$/.test(t) ? t : null;
  ghCli.__ghToken = { at: Date.now(), token };
  return token;
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

const g = globalThis as unknown as { __unpushed?: Map<string, number> };
g.__unpushed ??= new Map();
const unpushedCache = g.__unpushed;

/** How far the agent's local code is ahead of GitHub. */
export async function githubStatus(projectId: string) {
  const ctx = await loadBuild(projectId);
  const [token, mode, repo, headR] = await Promise.all([
    githubToken(),
    pushMode(),
    repoState(projectId),
    ctx.build ? sh("git", ["rev-parse", "HEAD"], { cwd: ctx.dir }) : null,
  ]);
  if (!ctx.build) return { built: false, connected: !!token, mode, repo: null, unpushed: 0 };
  const head = headR?.out.trim() ?? "";
  let unpushed = 0;
  if (head && head !== repo?.pushed_sha) {
    // The same two commits always give the same count: ask git once.
    const key = `${ctx.dir}\0${repo?.pushed_sha ?? ""}..${head}`;
    const hit = unpushedCache.get(key);
    if (hit !== undefined) unpushed = hit;
    else {
      const known = repo?.pushed_sha && (await sh("git", ["cat-file", "-e", `${repo.pushed_sha}^{commit}`], { cwd: ctx.dir })).ok;
      const r = await sh("git", ["rev-list", "--count", known ? `${repo!.pushed_sha}..${head}` : head], { cwd: ctx.dir });
      unpushed = Number(r.out.trim()) || 0;
      if (r.ok) unpushedCache.set(key, unpushed);
    }
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
  }
  // AgentCore: each deploy replaces the runtime's settings, so the workflow sends them (KEY=value lines).
  if (host === "agentcore") {
    const run = await deployEnv({ projectId, design: ctx.design, slug: ctx.slug, host });
    out.AGENT_RUNTIME_ENV = Object.entries(run).filter(([, v]) => v && !/[\r\n]/.test(v)).map(([k, v]) => `${k}=${v}`).join("\n");
  }
  // AWS access for GitHub comes from the CI access slot (a keyless deploy role), set up by pushAgent.
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

  // AWS's deploy tool drops a large build bundle in .bedrock_agentcore/: never send it (GitHub caps files at 100 MB).
  const gi = await sh("sh", ["-c", "grep -qx '.bedrock_agentcore/' .gitignore 2>/dev/null || printf '.bedrock_agentcore/\\n' >> .gitignore"], { cwd: ctx.dir });
  const tracked = (await sh("git", ["ls-files", ".bedrock_agentcore"], { cwd: ctx.dir })).out.trim();
  if (gi.ok && tracked) {
    await sh("git", ["rm", "-r", "--cached", "-q", ".bedrock_agentcore"], { cwd: ctx.dir });
    await sh("git", ["add", ".gitignore"], { cwd: ctx.dir });
    await sh("git", ["commit", "-q", "-m", "chore: keep AWS build bundles out of git"], { cwd: ctx.dir });
  }

  // Keep the release workflow current (agents packaged before a workflow fix get it on their next push).
  const dep = await getDeploy(projectId);
  if (dep.prepared_at && ctx.design) {
    const wf = deployFiles({ title: ctx.title, design: ctx.design, host: dep.host ?? "agentcore" }).find((f) => f.path === ".github/workflows/agent-ci.yml");
    const file = path.join(ctx.dir, ".github/workflows/agent-ci.yml");
    const cur = await fs.readFile(file, "utf8").catch(() => "");
    if (wf && cur !== wf.content) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, wf.content);
      await sh("git", ["add", ".github/workflows/agent-ci.yml"], { cwd: ctx.dir });
      await sh("git", ["commit", "-q", "-m", "ci: send the agent's settings with each release"], { cwd: ctx.dir });
    }
  }

  // Before pushing (the push starts the workflow): give GitHub access to the host, then the secrets it reads.
  let note: string | undefined;
  const slug = repo.repo;
  const host = await chosenHost(projectId);
  const haveGh = (await sh("gh", ["--version"], { cwd: ctx.dir, timeoutMs: 10_000 })).ok;
  // GitHub may sign workflows with an immutable-ID identity ("repo:owner@id/name@id"): trust that form too.
  const subjects = [`repo:${repo.owner}/${repo.repo}`];
  const custom: any = await gh(token, `/repos/${repo.owner}/${repo.repo}/actions/oidc/customization/sub`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (custom?.sub_claim_prefix && !subjects.includes(custom.sub_claim_prefix)) subjects.push(custom.sub_claim_prefix);
  const ci = repo.ci === host ? { vars: {}, secrets: {} } : await ciAccess(host).ensure({ owner: repo.owner, repo: repo.repo, slug, subjects });
  if (ci.note) note = ci.note;
  if (haveGh) {
    for (const [k, v] of Object.entries(ci.vars)) {
      await sh("gh", ["variable", "set", k, "--body", v, "--repo", `${repo.owner}/${repo.repo}`], { cwd: ctx.dir, env: { GH_TOKEN: token }, timeoutMs: 60_000 });
    }
  }
  const secrets = { ...(await workflowSecrets(projectId)), ...ci.secrets };
  const hashes = { ...(repo.secret_hashes ?? {}) };
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
  const ciDone = haveGh && !ci.note ? host : repo.ci;

  const before = await githubStatus(projectId);
  const auth = Buffer.from(`x-access-token:${token}`).toString("base64");
  const push = await sh(
    "git",
    ["-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${auth}`, "push", `https://github.com/${repo.owner}/${repo.repo}.git`, "HEAD:refs/heads/main"],
    { cwd: ctx.dir, timeoutMs: 3 * 60_000 },
  );
  if (!push.ok) return { ok: false, error: `Push failed: ${push.out.replaceAll(token, "***").replaceAll(auth, "***").slice(-600)}` };
  const head = (await sh("git", ["rev-parse", "HEAD"], { cwd: ctx.dir })).out.trim();

  await saveRepoState(projectId, { ...repo, pushed_sha: head, pushed_at: new Date().toISOString(), secret_hashes: hashes, ci: ciDone });
  return { ok: true, url: `https://github.com/${repo.owner}/${repo.repo}`, pushed: before.unpushed, note };
}
