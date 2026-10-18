/**
 * Agent pipeline — stage 6: Deployment (orchestrator side).
 *
 *   prepare  → write the deploy files into the agent repo, add deploy dependencies, lock, commit
 *   database → save DATABASE_URL, create tables (checkpoints, kill switch, run log)
 *   release  → ship the current commit to STAGING on the chosen host
 *   check    → run the evals against the deployed staging version (canary check)
 *   promote  → after the owner approves: production → that release
 *   rollback → production → the previous release
 *
 * Hosts are runtime adapters (AgentCore, Railway); this file is host-neutral.
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { getPhaseState, getProjectSettings, savePhaseState } from "../store";
import { readConnectorConfig } from "../connectors/config";
import { SAFETY_PY, RUN_PY, EVAL_RUNNER_PY } from "./adapters/langchain-runtime";
import { deployFiles } from "./adapters/deploy-files";
import { writeCodebase } from "../phases/agent-engineering";
import { agentEnv } from "./env";
import { credentialsAdapter } from "./registry";
import type { AgentDesign } from "./design";
import { sh, uvBin } from "./proc";
import { awsEnv } from "./aws";

export type HostId = "agentcore" | "railway";
export type DeployEnv = "staging" | "production";

export interface Target {
  host: "agentcore" | "http";
  arn?: string;
  qualifier?: string;
  region?: string;
  url?: string;
  api_key?: string;
}

export interface Release {
  id: string;
  commit: string;
  at: string;
  env: DeployEnv;
  version?: string;
  ok: boolean;
  log?: string;
}

export interface DeployState {
  host?: HostId;
  prepared_at?: string;
  db?: { ok: boolean; at: string; error?: string };
  railway_urls?: Partial<Record<DeployEnv, string>>;
  staging?: { release: Release; target: Target };
  production?: { release: Release; target: Target };
  history: Release[];
  check?: { release: string; at: string; passed: boolean; summary: any; gate: { label: string; ok: boolean; detail: string }[] };
  approvals: { release: string; at: string; by: string }[];
}

export async function getDeploy(projectId: string): Promise<DeployState> {
  return (await getPhaseState<DeployState>(projectId, "deployment")) ?? { history: [], approvals: [] };
}
export async function saveDeploy(projectId: string, s: DeployState) {
  await savePhaseState(projectId, "deployment", s);
}

export async function chosenHost(projectId: string): Promise<HostId> {
  return ((await getProjectSettings(projectId)).agentStack?.runtime as HostId) || "agentcore";
}

/* ---------------- prepare ---------------- */

const DEPLOY_DEPS = [
  "langfuse>=3.8",
  "starlette>=0.40",
  "uvicorn>=0.30",
  "psycopg[binary]>=3.2",
  "psycopg-pool>=3.2",
  "langgraph-checkpoint-postgres>=2.0",
  "pyjwt[crypto]>=2.9",
  "bedrock-agentcore>=0.1",
];
const DEPLOY_DEV_DEPS = ["boto3>=1.35", "pyyaml>=6", "bedrock-agentcore-starter-toolkit>=0.1"];

/** Add any missing deploy dependencies to pyproject.toml (agents built before stage 6 lack them). */
function patchPyproject(toml: string): string {
  let s = toml;
  const name = (d: string) => d.split(/[<>=\[]/)[0].toLowerCase();
  const has = (d: string) => new RegExp(`"${name(d).replace(/[-_]/g, "[-_]")}(\\[|[<>=]|")`, "i").test(s);
  const missing = DEPLOY_DEPS.filter((d) => !has(d));
  if (missing.length) s = s.replace(/dependencies = \[\n/, (m) => m + missing.map((d) => `    "${d}",\n`).join(""));
  const devMissing = DEPLOY_DEV_DEPS.filter((d) => !has(d));
  if (devMissing.length) s = s.replace(/dev = \[([^\]]*)\]/, (_m, inner) => `dev = [${inner}${devMissing.map((d) => `, "${d}"`).join("")}]`);
  return s;
}

export async function prepare(args: { projectId: string; dir: string; title: string; design: AgentDesign; host: HostId }) {
  const { dir, title, design, host } = args;
  const files = [
    { path: "agent/safety.py", content: SAFETY_PY, explains: "" },
    { path: "agent/run.py", content: RUN_PY, explains: "" },
    { path: "evals/run_evals.py", content: EVAL_RUNNER_PY, explains: "" },
    ...deployFiles({ title, design, host }),
  ];
  const pyproject = await fs.readFile(path.join(dir, "pyproject.toml"), "utf8");
  files.push({ path: "pyproject.toml", content: patchPyproject(pyproject), explains: "" });
  const gitignore = await fs.readFile(path.join(dir, ".gitignore"), "utf8").catch(() => "");
  if (!/^requirements\.txt$/m.test(gitignore)) files.push({ path: ".gitignore", content: gitignore.trimEnd() + "\nrequirements.txt\n", explains: "" });
  await writeCodebase(dir, files, "deploy: server, state, auth, ops, Dockerfile, CI");
  const lock = await sh(uvBin(), ["lock"], { cwd: dir, timeoutMs: 10 * 60_000 });
  const sync = lock.ok ? await sh(uvBin(), ["sync"], { cwd: dir, timeoutMs: 15 * 60_000 }) : lock;
  if (sync.ok) await writeCodebase(dir, [], "deploy: lock dependencies");
  return { ok: sync.ok, output: sync.out.slice(-4000), files: deployFiles({ title, design, host }).map((f) => ({ path: f.path, explains: f.explains })) };
}

/* ---------------- env for the deployed agent ---------------- */

const AUTH_MODE: Record<string, string> = { "machine-key": "machine-key", "supabase-auth": "supabase", "neon-auth": "neon", clerk: "clerk" };

/** Supabase project ref from a connection string (db.<ref>.supabase.co, or postgres.<ref>@…pooler…). */
export function supabaseRef(databaseUrl: string): string | null {
  return /db\.([a-z0-9]{15,})\.supabase\.co/i.exec(databaseUrl)?.[1] ?? /postgres\.([a-z0-9]{15,})[:@]/i.exec(databaseUrl)?.[1] ?? null;
}

/** Generate the agent's own keys once (machine key for HTTP hosts, eval key for deployed-version checks). */
export async function ensureAgentKeys(projectId: string) {
  const creds = await credentialsAdapter(projectId);
  const have = await creds.envFor(projectId);
  const patch: Record<string, string> = {};
  if (!have.AGENT_API_KEY) patch.AGENT_API_KEY = `ak_${crypto.randomBytes(24).toString("base64url")}`;
  if (!have.EVAL_KEY) patch.EVAL_KEY = `ek_${crypto.randomBytes(24).toString("base64url")}`;
  if (Object.keys(patch).length) await creds.save(projectId, patch);
  return { ...have, ...patch };
}

export async function deployEnv(args: { projectId: string; design: AgentDesign; slug: string; host: HostId }): Promise<Record<string, string>> {
  const { projectId, design, slug, host } = args;
  const env = await agentEnv(projectId, design, slug);
  const own = await ensureAgentKeys(projectId);
  const mode = AUTH_MODE[design.login?.selected ?? "machine-key"] ?? "machine-key";
  const out: Record<string, string> = {
    ...env,
    AGENT_NAME: slug,
    AUTH_MODE: mode,
    EVAL_KEY: own.EVAL_KEY,
  };
  // On AgentCore, AWS IAM already guards the endpoint; HTTP hosts need the agent's own key.
  if (mode === "machine-key" && host === "railway") out.AGENT_API_KEY = own.AGENT_API_KEY;
  else delete out.AGENT_API_KEY;
  if (mode === "supabase" && !out.AUTH_JWKS_URL && out.DATABASE_URL) {
    const ref = supabaseRef(out.DATABASE_URL);
    if (ref) {
      out.AUTH_JWKS_URL = `https://${ref}.supabase.co/auth/v1/.well-known/jwks.json`;
      out.AUTH_AUDIENCE = out.AUTH_AUDIENCE || "authenticated";
    }
  }
  delete out.LANGSMITH_TRACING; // tracing in production goes to the tracing slot's default (Langfuse) when connected
  return out;
}

export async function hostCredentials(host: HostId): Promise<Record<string, string> | null> {
  if (host === "agentcore") return awsEnv();
  const c = await readConnectorConfig("railway");
  if (!c?.productionToken) return null;
  return { RAILWAY_TOKEN_PRODUCTION: c.productionToken, RAILWAY_TOKEN_STAGING: c.stagingToken || "" };
}

/** Release ids: short commit + time, written to RELEASE so /ping reports exactly what's live. */
export async function stampRelease(dir: string): Promise<{ id: string; commit: string }> {
  const commit = (await sh("git", ["rev-parse", "--short", "HEAD"], { cwd: dir })).out.trim() || "nocommit";
  const id = `${commit}-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`;
  await fs.writeFile(path.join(dir, "RELEASE"), id + "\n");
  return { id, commit };
}
