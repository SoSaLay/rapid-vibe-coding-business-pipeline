/**
 * Runtime-host slot: AgentCore (default) and Railway. Both ship the same code;
 * they differ only in how a release gets there and how production is pinned.
 *
 * AgentCore: the starter toolkit builds in AWS (no local Docker). Every deploy is
 * a new runtime version; DEFAULT (= newest) is staging, and the "production"
 * endpoint is pinned to a version — so promote and rollback are one API call.
 *
 * Railway: `railway up` uploads the repo and Railway builds the Dockerfile.
 * Staging and production are Railway environments with their own project tokens
 * (staging optional). Rollback re-ships the previous release's commit.
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { DeployEnv, HostId, Release, Target } from "../deploy";
import { lastJson, scrub, sh, uvBin } from "../proc";

export interface ReleaseResult {
  ok: boolean;
  log: string;
  target?: Target;
  version?: string;
}

export interface RuntimeAdapter {
  id: HostId;
  label: string;
  /** Ship the repo's current state. AgentCore always lands on staging (DEFAULT); Railway on `env`. */
  ship(args: { dir: string; slug: string; env: DeployEnv; agentEnv: Record<string, string>; creds: Record<string, string>; urls?: Partial<Record<DeployEnv, string>> }): Promise<ReleaseResult>;
  /** Make `release` live in production. */
  promote(args: { dir: string; slug: string; release: Release; agentEnv: Record<string, string>; creds: Record<string, string>; urls?: Partial<Record<DeployEnv, string>> }): Promise<ReleaseResult>;
}

/* ---------------- AgentCore ---------------- */

/** AgentCore names: letters, digits, underscores; start with a letter; ≤48 chars. */
function agentcoreName(slug: string) {
  const n = slug.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (/^[A-Za-z]/.test(n) ? n : `a_${n}`).slice(0, 48);
}

async function agentcoreInfo(dir: string, creds: Record<string, string>) {
  const r = await sh(uvBin(), ["run", "python", "-m", "deploy.agentcore_ops", "info"], { cwd: dir, env: creds, timeoutMs: 120_000 });
  return { ...r, info: lastJson<{ arn: string; id: string; region: string; versions: string[]; endpoints: Record<string, string> }>(r.out) };
}

export const agentcoreRuntime: RuntimeAdapter = {
  id: "agentcore",
  label: "Amazon Bedrock AgentCore",
  async ship({ dir, slug, agentEnv, creds }) {
    const secrets = Object.values({ ...agentEnv, ...creds });
    const logs: string[] = [];
    const exp = await sh(uvBin(), ["export", "--no-dev", "--no-hashes", "--frozen", "-o", "requirements.txt"], { cwd: dir });
    if (!exp.ok) return { ok: false, log: exp.out.slice(-3000) };
    const configured = await fs
      .access(path.join(dir, ".bedrock_agentcore.yaml"))
      .then(() => true)
      .catch(() => false);
    if (!configured) {
      const cfg = await sh(
        uvBin(),
        ["run", "agentcore", "configure", "--entrypoint", "agentcore_app.py", "--name", agentcoreName(slug), "--region", creds.AWS_REGION,
          "--requirements-file", "requirements.txt", "--disable-memory", "--non-interactive"],
        { cwd: dir, env: creds, timeoutMs: 5 * 60_000 }
      );
      logs.push(scrub(cfg.out, secrets));
      if (!cfg.ok) return { ok: false, log: logs.join("\n") };
    }
    const envArgs = Object.entries(agentEnv).flatMap(([k, v]) => ["--env", `${k}=${v}`]);
    let dep = await sh(uvBin(), ["run", "agentcore", "deploy", "--auto-update-on-conflict", ...envArgs], { cwd: dir, env: creds, timeoutMs: 30 * 60_000 });
    // Older toolkits call it `launch`.
    if (!dep.ok && /No such command|Usage:/i.test(dep.out)) {
      dep = await sh(uvBin(), ["run", "agentcore", "launch", "--auto-update-on-conflict", ...envArgs], { cwd: dir, env: creds, timeoutMs: 30 * 60_000 });
    }
    logs.push(scrub(dep.out, secrets));
    if (!dep.ok) return { ok: false, log: logs.join("\n") };
    const { info, out } = await agentcoreInfo(dir, creds);
    if (!info?.arn) return { ok: false, log: [...logs, scrub(out, secrets)].join("\n") };
    const version = info.versions[info.versions.length - 1];
    return { ok: true, log: logs.join("\n"), version, target: { host: "agentcore", arn: info.arn, qualifier: "DEFAULT", region: info.region } };
  },
  async promote({ dir, release, creds }) {
    if (!release.version) return { ok: false, log: "This release has no AgentCore version." };
    const r = await sh(uvBin(), ["run", "python", "-m", "deploy.agentcore_ops", "promote", release.version], { cwd: dir, env: creds, timeoutMs: 5 * 60_000 });
    const info = lastJson<{ arn: string; region: string }>(r.out);
    if (!r.ok || !info?.arn) return { ok: false, log: r.out.slice(-3000) };
    return { ok: true, log: `production → version ${release.version}`, version: release.version, target: { host: "agentcore", arn: info.arn, qualifier: "production", region: info.region } };
  },
};

/* ---------------- Railway ---------------- */

const RAILWAY = ["-y", "@railway/cli@4"];

async function railwayShip(dir: string, token: string, agentEnv: Record<string, string>, url: string | undefined): Promise<ReleaseResult> {
  const secrets = [...Object.values(agentEnv), token];
  const env = { RAILWAY_TOKEN: token };
  const sets = Object.entries(agentEnv).flatMap(([k, v]) => ["--set", `${k}=${v}`]);
  const vars = await sh("npx", [...RAILWAY, "variables", ...sets, "--skip-deploys"], { cwd: dir, env, timeoutMs: 5 * 60_000 });
  const up = await sh("npx", [...RAILWAY, "up", "--detach"], { cwd: dir, env, timeoutMs: 15 * 60_000 });
  const log = [vars.ok ? "variables set" : `variables: ${scrub(vars.out, secrets)}`, scrub(up.out, secrets)].join("\n");
  if (!up.ok) return { ok: false, log };
  const found = url || /(https:\/\/[a-z0-9.-]+\.up\.railway\.app)/i.exec(up.out)?.[1];
  if (!found) return { ok: false, log: log + "\nUploaded, but no service URL yet. Paste the service's public URL (Railway → Settings → Networking → Generate domain)." };
  // Wait until the new release answers /ping.
  const release = (await fs.readFile(path.join(dir, "RELEASE"), "utf8")).trim();
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(found.replace(/\/$/, "") + "/ping");
      const j = await r.json();
      if (j?.release === release) return { ok: true, log, target: { host: "http", url: found, api_key: agentEnv.AGENT_API_KEY } };
    } catch {
      /* still building */
    }
    await new Promise((res) => setTimeout(res, 10_000));
  }
  return { ok: false, log: log + `\nTimed out waiting for ${found}/ping to report release ${release}.` };
}

export const railwayRuntime: RuntimeAdapter = {
  id: "railway",
  label: "Railway",
  async ship({ dir, env, agentEnv, creds, urls }) {
    const token = env === "staging" ? creds.RAILWAY_TOKEN_STAGING : creds.RAILWAY_TOKEN_PRODUCTION;
    if (!token) return { ok: false, log: `No Railway ${env} token. Add one in the toolbox.` };
    return railwayShip(dir, token, agentEnv, urls?.[env]);
  },
  async promote({ dir, release, agentEnv, creds, urls }) {
    // Ship that release's exact commit to production from a clean checkout (also how rollback works).
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-release-"));
    try {
      const wt = await sh("git", ["worktree", "add", "--detach", tmp, release.commit], { cwd: dir });
      if (!wt.ok) return { ok: false, log: wt.out };
      await fs.writeFile(path.join(tmp, "RELEASE"), release.id + "\n");
      return await railwayShip(tmp, creds.RAILWAY_TOKEN_PRODUCTION, agentEnv, urls?.production);
    } finally {
      await sh("git", ["worktree", "remove", "--force", tmp], { cwd: dir });
    }
  },
};

/** What a release made elsewhere (GitHub's agent-ci) left on the host: its newest version and staging target. */
export async function currentStaging(host: HostId, dir: string, creds: Record<string, string>, urls?: Partial<Record<DeployEnv, string>>): Promise<{ version?: string; target: Target } | null> {
  if (host === "railway") return urls?.staging ? { target: { host: "http", url: urls.staging } } : null;
  const { info } = await agentcoreInfo(dir, creds);
  if (!info?.arn) return null;
  return { version: info.versions[info.versions.length - 1], target: { host: "agentcore", arn: info.arn, qualifier: "DEFAULT", region: info.region } };
}

export function runtimeAdapter(host: HostId): RuntimeAdapter {
  return host === "railway" ? railwayRuntime : agentcoreRuntime;
}
