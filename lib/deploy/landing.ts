/**
 * Landing-page quick deploy — AWS Amplify "manual deployment" of the single
 * self-contained HTML file generated in Pre-Marketing (Phase 4).
 *
 * Why this shape: the pipeline is a localhost tool, and Phase 8 already relies on
 * the owner's locally-configured AWS CLI. Rather than embed an AWS SDK + manage
 * credentials in the orchestrator (which the project deliberately avoids), this
 * shells out to that same `aws` CLI to run an Amplify *manual* deployment — no
 * git repo, no SSR, just upload a zip and get an HTTPS URL "right there and then".
 *
 * This is intentionally separate from the Phase 8 app deploy: the landing page
 * goes live weeks before the product exists and lives at its own URL. Migrate
 * later (custom domain, or fold into the main app) whenever you like.
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

export interface LandingDeployResult {
  ok: boolean;
  appId?: string;
  /** The live HTTPS URL once the deployment SUCCEEDs. */
  url?: string;
  error?: string;
  /** Human-readable step log — surfaced in the UI so a failure is debuggable. */
  log: string[];
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a command, capturing output. Never throws — inspect `code`. */
function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: stderr + String(e) }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

/** `aws ...` with JSON kept out of stdout noise; returns trimmed stdout on success. */
async function aws(args: string[], log: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  const r = await run("aws", args);
  if (r.code !== 0) {
    log.push(`✗ aws ${args.slice(0, 3).join(" ")} … (exit ${r.code})`);
    return { ok: false, out: r.stdout, err: r.stderr || r.stdout || "aws command failed" };
  }
  return { ok: true, out: r.stdout, err: "" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deploy `htmlDir` (must contain index.html) to Amplify under app `<slug>-landing`,
 * branch `main`. Reuses an existing app/branch when `existingAppId` is supplied or
 * an app of that name already exists, so re-deploys are idempotent.
 */
export async function deployLandingToAmplify(args: {
  slug: string;
  htmlDir: string;
  existingAppId?: string;
}): Promise<LandingDeployResult> {
  const log: string[] = [];
  const appName = `${args.slug}-landing`;
  const branch = "main";

  // 0. Preconditions: aws CLI present + index.html exists.
  const ver = await run("aws", ["--version"]);
  if (ver.code !== 0) {
    return {
      ok: false,
      log,
      error:
        "The AWS CLI isn't available on this machine. Install it and run `aws configure` (same setup Phase 8 uses), then try again.",
    };
  }
  try {
    await fs.access(path.join(args.htmlDir, "index.html"));
  } catch {
    return { ok: false, log, error: "No landing page found to deploy — generate the page first." };
  }

  // 1. Find or create the Amplify app (manual = no --repository).
  let appId = args.existingAppId;
  if (appId) {
    const check = await aws(["amplify", "get-app", "--app-id", appId, "--query", "app.appId", "--output", "text"], log);
    if (!check.ok) appId = undefined; // stored id is stale — fall through and re-resolve
  }
  if (!appId) {
    const found = await aws(
      ["amplify", "list-apps", "--query", `apps[?name=='${appName}'].appId | [0]`, "--output", "text"],
      log
    );
    if (found.ok && found.out && found.out !== "None") {
      appId = found.out;
      log.push(`✓ Reusing Amplify app ${appName}`);
    } else {
      const created = await aws(
        ["amplify", "create-app", "--name", appName, "--platform", "WEB",
         "--tags", "pipeline=rapid-vibe,kind=landing", "--query", "app.appId", "--output", "text"],
        log
      );
      if (!created.ok) return { ok: false, log, error: `Couldn't create the Amplify app: ${created.err}` };
      appId = created.out;
      log.push(`✓ Created Amplify app ${appName}`);
    }
  }

  // 2. Ensure the branch exists.
  const branches = await aws(
    ["amplify", "list-branches", "--app-id", appId!, "--query", `branches[?branchName=='${branch}'].branchName | [0]`, "--output", "text"],
    log
  );
  if (!(branches.ok && branches.out && branches.out !== "None")) {
    const cb = await aws(["amplify", "create-branch", "--app-id", appId!, "--branch-name", branch], log);
    if (!cb.ok) return { ok: false, log, appId, error: `Couldn't create the branch: ${cb.err}` };
    log.push(`✓ Created branch ${branch}`);
  }

  // 3. Create a manual deployment → get the presigned zip upload URL + job id.
  const dep = await aws(
    ["amplify", "create-deployment", "--app-id", appId!, "--branch-name", branch, "--output", "json"],
    log
  );
  if (!dep.ok) return { ok: false, log, appId, error: `Couldn't start a deployment: ${dep.err}` };
  let jobId = "";
  let zipUploadUrl = "";
  try {
    const parsed = JSON.parse(dep.out);
    jobId = parsed.jobId;
    zipUploadUrl = parsed.zipUploadUrl;
  } catch {
    return { ok: false, log, appId, error: "Unexpected response from Amplify (create-deployment)." };
  }
  if (!zipUploadUrl) return { ok: false, log, appId, error: "Amplify didn't return an upload URL." };

  // 4. Zip the landing dir (macOS/Linux `zip`) and PUT it to the presigned URL.
  const zipPath = path.join(os.tmpdir(), `rvc-landing-${args.slug}-${Date.now()}.zip`);
  const zipped = await run("zip", ["-r", "-q", zipPath, "."], { cwd: args.htmlDir });
  if (zipped.code !== 0) {
    return { ok: false, log, appId, error: `Couldn't zip the landing page: ${zipped.stderr || "zip failed"}` };
  }
  log.push("✓ Packaged landing page");
  try {
    const buf = await fs.readFile(zipPath);
    const put = await fetch(zipUploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/zip" },
      body: buf,
    });
    if (!put.ok) return { ok: false, log, appId, error: `Upload failed (HTTP ${put.status}).` };
    log.push("✓ Uploaded");
  } finally {
    fs.unlink(zipPath).catch(() => {});
  }

  // 5. Start the deployment and poll until it settles.
  const start = await aws(
    ["amplify", "start-deployment", "--app-id", appId!, "--branch-name", branch, "--job-id", jobId],
    log
  );
  if (!start.ok) return { ok: false, log, appId, error: `Couldn't kick off the build: ${start.err}` };
  log.push("✓ Deploying…");

  let status = "PENDING";
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const job = await aws(
      ["amplify", "get-job", "--app-id", appId!, "--branch-name", branch, "--job-id", jobId,
       "--query", "job.summary.status", "--output", "text"],
      log
    );
    if (job.ok && job.out) status = job.out;
    if (["SUCCEED", "FAILED", "CANCELLED"].includes(status)) break;
  }
  if (status !== "SUCCEED") {
    return { ok: false, log, appId, error: `Deployment ended with status ${status}.` };
  }

  // 6. Resolve the live URL from the app's default domain.
  const domain = await aws(
    ["amplify", "get-app", "--app-id", appId!, "--query", "app.defaultDomain", "--output", "text"],
    log
  );
  const defaultDomain = domain.ok && domain.out && domain.out !== "None" ? domain.out : `${appId}.amplifyapp.com`;
  const url = `https://${branch}.${defaultDomain}`;
  log.push(`✓ Live at ${url}`);
  return { ok: true, appId, url, log };
}
