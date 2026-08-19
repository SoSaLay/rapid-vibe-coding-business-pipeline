/**
 * Phase 8 — Deployment.
 *
 * Hands-off as honestly possible: the orchestrator plans, the coding agent
 * executes the runbook in the app workspace (AWS CLI + gh CLI), the
 * orchestrator verifies the live URLs itself. Consumes build-manifest +
 * qa-report (+ stack-selection), produces `deploy-manifest`.
 *
 * Stages: plan (LLM env-var inventory + human todos, deterministic runbook
 * via the deploy-target registry) → preflight (local CLI checks, auto-
 * verified) → agent deploy run (one paste command, 20s monitor) → verify +
 * sign-off (orchestrator fetches prod and checks HTTPS/security headers).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { activeProvider } from "../llm/registry";
import { ideaTypeContext } from "../idea-types";
import { DeployEnvVar } from "../deploy/types";
import { SKIMMABLE_STYLE } from "./brevity";

const exec = promisify(execFile);

export const DEPLOY_RESULTS_PATH = "deploy/results.json";

/* ---------------- Stage 1: plan (LLM slice — env vars + human todos) ---------------- */

export interface DeployPlan {
  summary: string;
  env_vars: DeployEnvVar[];
  human_todos: string[];
  notes: string[];
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "2-3 sentences: what gets deployed where, in plain language for a non-developer." },
    env_vars: {
      type: "array",
      description:
        "EVERY environment variable the deployed app needs, from .env.example + the launch guide. Names exactly as the code expects them.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string", description: "What it is and where the human gets it, one line." },
          required: { type: "boolean" },
          secret: { type: "boolean", description: "true unless it's safe in a browser bundle (NEXT_PUBLIC_*)." },
        },
        required: ["name", "description", "required", "secret"],
      },
    },
    human_todos: {
      type: "array",
      items: { type: "string" },
      description:
        "ONLY the things the agent genuinely cannot do (e.g. buy a domain, approve a cost, create an external account). Empty if none. Never include things the runbook automates.",
    },
    notes: {
      type: "array",
      items: { type: "string" },
      description: "App-specific deployment gotchas worth knowing (webhooks to repoint, cron needs, third-party callbacks). Empty if none.",
    },
  },
  required: ["summary", "env_vars", "human_todos", "notes"],
};

export async function generateDeployPlan(args: {
  spec: Record<string, any>;
  manifest: Record<string, any>;
  envExample: string | null;
  productTitle: string;
  waf: boolean;
  domain: string | null;
}): Promise<DeployPlan> {
  const provider = activeProvider();
  const stack = Array.isArray(args.manifest.stack)
    ? args.manifest.stack.map((c: any) => `${c.slot}: ${c.choice}`).join(", ")
    : "(unknown — assume studio defaults)";
  return provider.completeJson<DeployPlan>({
    system:
      "You are a pragmatic release engineer planning the deployment of a solo founder's MVP to AWS Amplify Hosting " +
      "(Next.js SSR on Lambda, branch-based dev/uat/prod environments). The coding agent executes everything it can; " +
      "the human only does what machines can't. Be precise about env vars — a wrong name breaks production silently.\n\n" +
      SKIMMABLE_STYLE,
    effort: "medium",
    schema: PLAN_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `PRODUCT: ${args.productTitle}\n\nSTACK: ${stack}\n${ideaTypeContext(args.spec.idea_type)}\n\n` +
          `OPTIONS: WAF ${args.waf ? "enabled" : "off"}; custom domain ${args.domain || "none (free amplifyapp.com URL)"}.\n\n` +
          `.env.example FROM THE WORKSPACE:\n${args.envExample || "(missing — derive variables from the launch guide)"}\n\n` +
          `LAUNCH GUIDE (written by the build agent):\n${String(args.manifest.launch_guide || "").slice(0, 6000)}\n\n` +
          "Produce the deploy plan: summary, the full env-var inventory, human todos, and app-specific notes.",
      },
    ],
  });
}

/* ---------------- Stage 2: preflight (local, auto-verified) ---------------- */

export interface PreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

async function check(cmd: string, cmdArgs: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await exec(cmd, cmdArgs, { timeout: 15000 });
    return { ok: true, out: (stdout || stderr || "").trim() };
  } catch (e: any) {
    return { ok: false, out: (e?.stderr || e?.message || "failed").trim() };
  }
}

export async function runPreflight(workspaceOk: boolean): Promise<PreflightCheck[]> {
  const [awsCli, awsId, gh] = await Promise.all([
    check("aws", ["--version"]),
    check("aws", ["sts", "get-caller-identity", "--output", "json"]),
    check("gh", ["auth", "status"]),
  ]);

  let identity = "";
  if (awsId.ok) {
    try {
      const d = JSON.parse(awsId.out);
      identity = `account ${d.Account}, ${String(d.Arn || "").split("/").pop()}`;
    } catch {
      identity = "credentials valid";
    }
  }

  return [
    {
      id: "workspace",
      label: "App workspace with git",
      ok: workspaceOk,
      detail: workspaceOk ? "found" : "workspace folder missing",
      fix: workspaceOk ? undefined : "Re-run the Engineering scaffold — the app folder is gone.",
    },
    {
      id: "aws-cli",
      label: "AWS CLI installed",
      ok: awsCli.ok,
      detail: awsCli.ok ? awsCli.out.split(" ")[0] : "not found",
      fix: awsCli.ok ? undefined : "Install: brew install awscli",
    },
    {
      id: "aws-creds",
      label: "AWS credentials configured",
      ok: awsId.ok,
      detail: awsId.ok ? identity : "no valid credentials",
      fix: awsId.ok ? undefined : "Run: aws configure (paste an IAM user's access keys — not root)",
    },
    {
      id: "gh-auth",
      label: "GitHub CLI authenticated",
      ok: gh.ok,
      detail: gh.ok ? "logged in" : "not authenticated",
      fix: gh.ok ? undefined : "Run: gh auth login",
    },
  ];
}

/* ---------------- Stage 3: results parsing ---------------- */

export interface DeployEnvironment {
  name: string;
  branch: string;
  url: string;
  status: string;
  notes?: string;
}

export interface DeployResults {
  completed_at: string | null;
  target: string;
  app_id: string | null;
  region: string | null;
  repo_url: string | null;
  environments: DeployEnvironment[];
  waf: { requested: boolean; enabled: boolean; web_acl_arn: string | null; notes: string };
  domain: { requested: string | null; status: string; notes: string };
  blockers: string[];
}

export function parseDeployResults(raw: string): DeployResults | null {
  try {
    const d = JSON.parse(raw);
    return {
      completed_at: typeof d.completed_at === "string" ? d.completed_at : null,
      target: String(d.target ?? "amplify"),
      app_id: d.app_id ? String(d.app_id) : null,
      region: d.region ? String(d.region) : null,
      repo_url: d.repo_url ? String(d.repo_url) : null,
      environments: Array.isArray(d.environments)
        ? d.environments.map((e: any) => ({
            name: String(e.name ?? "?"),
            branch: String(e.branch ?? "?"),
            url: String(e.url ?? ""),
            status: String(e.status ?? "unknown"),
            notes: e.notes ? String(e.notes) : undefined,
          }))
        : [],
      waf: {
        requested: !!d.waf?.requested,
        enabled: !!d.waf?.enabled,
        web_acl_arn: d.waf?.web_acl_arn ? String(d.waf.web_acl_arn) : null,
        notes: String(d.waf?.notes ?? ""),
      },
      domain: {
        requested: d.domain?.requested ? String(d.domain.requested) : null,
        status: String(d.domain?.status ?? "none"),
        notes: String(d.domain?.notes ?? ""),
      },
      blockers: Array.isArray(d.blockers) ? d.blockers.map(String) : [],
    };
  } catch {
    return null;
  }
}

/* ---------------- Stage 4: live verification (orchestrator-side) ---------------- */

const SECURITY_HEADERS = [
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "content-security-policy",
];

export interface UrlVerification {
  name: string;
  url: string;
  reachable: boolean;
  status: number | null;
  https: boolean;
  headers_found: string[];
  headers_missing: string[];
}

/** The Phase-6 security carryover, automated: fetch each live env and check HTTPS + headers survived to production. */
export async function verifyEnvironments(environments: DeployEnvironment[]): Promise<UrlVerification[]> {
  return Promise.all(
    environments
      .filter((e) => e.url)
      .map(async (e) => {
        const url = e.url.startsWith("http") ? e.url : `https://${e.url}`;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          const res = await fetch(url, { redirect: "follow", signal: ctrl.signal });
          clearTimeout(t);
          const found = SECURITY_HEADERS.filter((h) => res.headers.has(h));
          return {
            name: e.name,
            url,
            reachable: true,
            status: res.status,
            https: url.startsWith("https://"),
            headers_found: found,
            headers_missing: SECURITY_HEADERS.filter((h) => !found.includes(h)),
          };
        } catch {
          return {
            name: e.name,
            url,
            reachable: false,
            status: null,
            https: url.startsWith("https://"),
            headers_found: [],
            headers_missing: SECURITY_HEADERS,
          };
        }
      })
  );
}

/** Sign-off gate: prod must be live and reachable; blockers must be empty (unless forced). */
export function evaluateDeployExit(results: DeployResults | null, verifications: UrlVerification[]): {
  ready: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!results) {
    blockers.push("Agent hasn't reported results yet (deploy/results.json missing).");
    return { ready: false, blockers };
  }
  const prod = results.environments.find((e) => e.name === "prod");
  if (!prod) blockers.push("No prod environment in the results.");
  else if (prod.status !== "live") blockers.push(`Prod environment status is "${prod.status}".`);
  const prodCheck = verifications.find((v) => v.name === "prod");
  if (prodCheck && !prodCheck.reachable) blockers.push("Prod URL is not reachable from the orchestrator.");
  if (prodCheck && prodCheck.status !== null && prodCheck.status >= 500) blockers.push(`Prod returns HTTP ${prodCheck.status}.`);
  for (const b of results.blockers) blockers.push(`Agent blocker: ${b}`);
  return { ready: blockers.length === 0, blockers };
}
