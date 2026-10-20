/**
 * Onboarding "Quick start": connect a tool by signing in with a browser instead of pasting keys.
 *
 *  - aws: runs `aws login` (AWS CLI 2.32+) — a browser sign-in with your AWS console account; the
 *    profile then works for the pipeline like any CLI sign-in. Older CLIs get the update command.
 *  - github: GitHub's device sign-in. With the project's OAuth app (PIPELINE_GITHUB_CLIENT_ID; public,
 *    no secret) it's the standard device flow: show a code, approve at github.com/login/device. Without
 *    it, the GitHub CLI's own browser sign-in (`gh auth login --web`) does the same job.
 *
 * Each flow runs in the background on this server; the page polls its status.
 */

import { spawn } from "child_process";
import { saveConnectorConfig } from "../connectors/config";
import { configureGithub } from "../github/import";
import { awsIdentity, awsDefaultRegion } from "../agent/aws";
import { sh } from "../agent/proc";

type Flow = { state: "running" | "done" | "failed"; code?: string; url?: string; error?: string; startedAt: number };
const g = globalThis as unknown as { __quickstart?: Record<string, Flow> };
g.__quickstart ??= {};
const flows = g.__quickstart;

export function quickstartStatus(id: "aws" | "github"): Flow | null {
  return flows[id] ?? null;
}

/* ---------------- AWS ---------------- */

export async function startAws(): Promise<Flow | { needsUpdate: true; command: string; version: string }> {
  const v = await sh("aws", ["--version"], { cwd: process.cwd(), timeoutMs: 10_000 }).catch(() => null);
  const m = /aws-cli\/(\d+)\.(\d+)/.exec(v?.out ?? "");
  if (!m) return { needsUpdate: true, command: "Install the AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html", version: "not installed" };
  if (Number(m[1]) < 2 || (Number(m[1]) === 2 && Number(m[2]) < 32)) {
    return { needsUpdate: true, command: process.platform === "darwin" ? "brew upgrade awscli" : "Update the AWS CLI to 2.32 or newer", version: `${m[1]}.${m[2]}` };
  }
  const region = (await awsDefaultRegion("default").catch(() => "")) || "us-east-1";
  const flow: Flow = { state: "running", startedAt: Date.now() };
  flows.aws = flow;
  // `aws login` opens the browser itself and waits for the sign-in to finish.
  const p = spawn("aws", ["login", "--profile", "default"], { env: { ...process.env, AWS_REGION: region, AWS_DEFAULT_REGION: region }, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (out += d));
  p.on("close", async (code) => {
    const who = await awsIdentity("default");
    if (code === 0 && who.ok) {
      await saveConnectorConfig("aws", { profile: "default", region, account: who.account ?? "", arn: who.arn ?? "" });
      flow.state = "done";
    } else {
      flow.state = "failed";
      flow.error = out.trim().split("\n").pop()?.slice(0, 300) || "AWS sign-in didn't finish.";
    }
  });
  setTimeout(() => flow.state === "running" && (p.kill(), (flow.state = "failed"), (flow.error = "Sign-in timed out.")), 10 * 60_000);
  return flow;
}

/* ---------------- GitHub ---------------- */

const SCOPES = "repo workflow";

export async function startGithub(): Promise<Flow> {
  const clientId = process.env.PIPELINE_GITHUB_CLIENT_ID;
  return clientId ? deviceFlow(clientId) : ghCliFlow();
}

async function deviceFlow(clientId: string): Promise<Flow> {
  const r = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: SCOPES }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!j.device_code) {
    const f: Flow = { state: "failed", error: j.error_description || "GitHub didn't start the sign-in.", startedAt: Date.now() };
    flows.github = f;
    return f;
  }
  const flow: Flow = { state: "running", code: j.user_code, url: j.verification_uri, startedAt: Date.now() };
  flows.github = flow;
  let interval = (j.interval ?? 5) * 1000;
  const deadline = Date.now() + (j.expires_in ?? 900) * 1000;
  (async () => {
    while (flow.state === "running" && Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, interval));
      const t: any = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, device_code: j.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
      }).then((x) => x.json()).catch(() => ({}));
      if (t.access_token) {
        const saved = await configureGithub(t.access_token);
        flow.state = saved.ok ? "done" : "failed";
        flow.error = saved.error;
        return;
      }
      if (t.error === "slow_down") interval += 5000;
      else if (t.error && t.error !== "authorization_pending") {
        flow.state = "failed";
        flow.error = t.error_description || t.error;
        return;
      }
    }
    if (flow.state === "running") (flow.state = "failed"), (flow.error = "The code expired. Try again.");
  })();
  return flow;
}

/** No OAuth app configured: let the GitHub CLI run its own browser sign-in and read the code it shows. */
async function ghCliFlow(): Promise<Flow> {
  const has = await sh("gh", ["--version"], { cwd: process.cwd(), timeoutMs: 10_000 }).catch(() => null);
  if (!has?.ok) {
    const f: Flow = { state: "failed", error: "Install the GitHub CLI (brew install gh), or use the traditional setup.", startedAt: Date.now() };
    flows.github = f;
    return f;
  }
  const flow: Flow = { state: "running", url: "https://github.com/login/device", startedAt: Date.now() };
  flows.github = flow;
  const p = spawn("gh", ["auth", "login", "--web", "--hostname", "github.com", "--git-protocol", "https", "--scopes", "repo,workflow"], {
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "";
  const read = (d: Buffer) => {
    out += d.toString();
    const code = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(out)?.[1];
    if (code && !flow.code) {
      flow.code = code;
      p.stdin.write("\n"); // "Press Enter to open github.com in your browser"
    }
  };
  p.stdout.on("data", read);
  p.stderr.on("data", read);
  p.on("close", async (c) => {
    const tok = await sh("gh", ["auth", "token"], { cwd: process.cwd(), timeoutMs: 10_000 }).catch(() => null);
    if (c === 0 && tok?.ok) flow.state = "done";
    else (flow.state = "failed"), (flow.error = out.trim().split("\n").pop()?.slice(0, 300) || "GitHub sign-in didn't finish.");
  });
  setTimeout(() => flow.state === "running" && (p.kill(), (flow.state = "failed"), (flow.error = "Sign-in timed out.")), 15 * 60_000);
  return flow;
}
