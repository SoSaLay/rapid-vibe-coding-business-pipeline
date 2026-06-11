/**
 * AWS Amplify Hosting target — the studio default. Amplify runs a Next.js
 * app's pages AND API routes on Lambda automatically (platform WEB_COMPUTE),
 * so "Amplify + Lambda" is one setup, not two. Environments are git branches:
 * dev / uat / main(prod), each auto-deploying on push.
 */

import { DeployTarget, DeployRunbookContext } from "./types";

export const RESULTS_CONTRACT_EXAMPLE = {
  completed_at: "<ISO timestamp>",
  target: "amplify",
  app_id: "<amplify app id>",
  region: "<aws region>",
  repo_url: "<github repo url>",
  environments: [
    { name: "prod", branch: "main", url: "https://main.<appid>.amplifyapp.com", status: "live|building|failed", notes: "" },
    { name: "uat", branch: "uat", url: "...", status: "live|building|failed", notes: "" },
    { name: "dev", branch: "dev", url: "...", status: "live|building|failed", notes: "" },
  ],
  waf: { requested: false, enabled: false, web_acl_arn: null, notes: "" },
  domain: { requested: null, status: "none|pending_dns|live", notes: "" },
  blockers: ["anything that needs the human — keep empty when none"],
};

function renderRunbook(ctx: DeployRunbookContext): string {
  const { productTitle, slug, options, envVars } = ctx;
  const lines: string[] = [
    `# DEPLOY PLAN — ${productTitle}`,
    "",
    "> Executed by the coding agent with the AWS CLI + gh CLI. Work top-to-bottom.",
    "> Idempotent by design: every step CHECKS before it CREATES, so this file is safe to re-run.",
    "> The pipeline dashboard reads `deploy/results.json` — write it at the end (contract below) even on failure.",
    "",
    "## Hard rules",
    "",
    "- NEVER print, echo, or commit a secret value. Env-var VALUES come from `.env.local`; only names appear in output.",
    "- Tag every created resource: `app=" + slug + "` and `pipeline=rapid-vibe`.",
    "- Use the configured AWS region (`aws configure get region`; default to us-east-1 if unset) for everything.",
    "- If a step hard-fails after one honest retry, STOP, record it under `blockers` in results.json, and finish the report.",
    "",
    "## 1. Repo + branches",
    "",
    "- Working tree must be clean (commit anything pending).",
    "- Ensure branches exist: `uat` and `dev`, both created from `main` if missing.",
    "- If no `origin` remote: `gh repo create " + slug + " --private --source . --push`.",
    "- Push all three branches to origin.",
    "",
    "## 2. Amplify app",
    "",
    "- Check `aws amplify list-apps` for an app named `" + slug + "` — reuse it if present.",
    "- Otherwise create it connected to the GitHub repo:",
    "  `aws amplify create-app --name " + slug + " --repository <repo https url> --access-token \"$(gh auth token)\" --platform WEB_COMPUTE --tags app=" + slug + ",pipeline=rapid-vibe`",
    "- WEB_COMPUTE is required — it's what runs Next.js SSR + API routes on Lambda.",
    "",
    "## 3. Environments (branches → Amplify branches)",
    "",
    "- For each of `main` (stage PRODUCTION), `uat` (stage BETA), `dev` (stage DEVELOPMENT):",
    "  check `aws amplify list-branches`, then `aws amplify create-branch --app-id <id> --branch-name <b> --stage <stage> --framework \"Next.js - SSR\"` if missing.",
    "",
    "## 4. Environment variables",
    "",
    "- Read values from `.env.local` (NEVER from this file, NEVER printed).",
    "- Set app-level vars with `aws amplify update-app --environment-variables` (branch-level via `update-branch` only if an env needs a different value, e.g. a separate dev Supabase project if one exists — otherwise shared values are fine for an MVP).",
    "- Expected variables for this app:",
    ...envVars.map(
      (v) => `  - \`${v.name}\` — ${v.description}${v.required ? "" : " (optional)"}${v.secret ? " **[secret]**" : ""}`
    ),
    "- Any required variable missing from `.env.local`: record it under `blockers` — do not invent values.",
    "",
    "## 5. Build + go live",
    "",
    "- Trigger each branch: `aws amplify start-job --app-id <id> --branch-name <b> --job-type RELEASE` (skip if the repo connection already auto-started one).",
    "- Poll `aws amplify get-job` until SUCCEED (or FAILED — then read the build log, fix the cause if it's small and safe, commit, and retry ONCE; otherwise record a blocker).",
    "- URLs follow `https://<branch>.<app-default-domain>` — confirm each with `aws amplify get-app` / `get-branch`.",
    "",
  ];

  if (options.waf) {
    lines.push(
      "## 6. WAF (requested for this app)",
      "",
      "- Create a WAFv2 web ACL (scope CLOUDFRONT, region us-east-1) named `" + slug + "-waf` with:",
      "  AWSManagedRulesCommonRuleSet + AWSManagedRulesKnownBadInputsRuleSet + a rate-based rule (2000 req / 5 min per IP).",
      "- Associate it with the Amplify app (`aws wafv2 associate-web-acl --resource-arn <amplify app arn>` — Amplify Hosting supports direct WAF association).",
      "- If your CLI version can't associate with Amplify directly: create the ACL anyway, record its ARN in results.json, and add a blocker telling the human to attach it in the Amplify console (Firewall settings) — one click.",
      ""
    );
  }

  if (options.domain) {
    lines.push(
      `## ${options.waf ? 7 : 6}. Custom domain — ${options.domain}`,
      "",
      "- The domain must already exist in Route 53 (the human bought it / moved DNS there).",
      "- `aws amplify create-domain-association --app-id <id> --domain-name " + options.domain + " --sub-domain-settings prefix=,branchName=main prefix=www,branchName=main`",
      "- SSL + DNS verification can take up to ~30 min — record status `pending_dns` and move on; do NOT block on it.",
      ""
    );
  }

  lines.push(
    "## Final step — report back",
    "",
    "Write `deploy/results.json` EXACTLY in this shape, then write a human-readable `DEPLOY-GUIDE.md`",
    "(URLs per environment, how to roll back via the Amplify console, where the logs live), commit both.",
    "",
    "```json",
    JSON.stringify(RESULTS_CONTRACT_EXAMPLE, null, 2),
    "```",
    ""
  );
  return lines.join("\n");
}

export const amplifyTarget: DeployTarget = {
  id: "amplify",
  label: "AWS Amplify",
  status: "active",
  note: "Studio default. Next.js SSR + API routes on Lambda automatically; branch-based dev/UAT/prod; generous free tier.",
  renderRunbook,
};
