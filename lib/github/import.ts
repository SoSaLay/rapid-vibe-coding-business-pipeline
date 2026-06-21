/**
 * GitHub repository import (Business Owner phase — "Use existing repository").
 *
 * Brownfield entry into the pipeline: an already-built repo is cloned into the
 * app workspace (~/Rapid Vibe Coding Apps/<slug>/ — the SAME place the
 * Engineering phase builds into), its stack is detected, and the LLM
 * reverse-engineers a product-spec from the code. The orchestrating route then
 * back-fills the upstream artifacts so every downstream phase has its inputs.
 *
 * The repo IS the engineering workspace, so "iterate on top of it" works
 * natively — open the workspace in Claude Code, or loop through Iteration.
 *
 * Token (optional, for private repos) is pasted in-app and stored locally under
 * data/connectors/github.json, or read from GITHUB_TOKEN / GH_TOKEN. The token
 * is injected only for the clone and stripped from the remote afterward so it
 * never lands on disk.
 */

import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { readConnectorConfig, saveConnectorConfig } from "../connectors/config";
import { activeProvider } from "../llm/registry";
import { SPEC_SCHEMA } from "../phases/product-owner";
import { StackChoice } from "../stack";

const exec = promisify(execFile);
const ID = "github";

/* ---------------- token / connection ---------------- */

export async function getGithubToken(): Promise<string | null> {
  const config = await readConnectorConfig(ID);
  return config?.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

export async function isGithubConfigured(): Promise<boolean> {
  return !!(await getGithubToken());
}

/** Validate + persist a GitHub token. A cheap /user GET confirms it's real. */
export async function configureGithub(token: string): Promise<{ ok: boolean; error?: string }> {
  const t = token?.trim();
  if (!t) return { ok: false, error: "Missing GitHub token." };
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "rapid-vibe-coding-pipeline",
      },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid or expired GitHub token." };
    if (!res.ok) return { ok: false, error: `GitHub error ${res.status}.` };
    await saveConnectorConfig(ID, { token: t });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach GitHub." };
  }
}

/* ---------------- URL parsing ---------------- */

export interface ParsedRepo {
  host: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  webUrl: string;
}

/** Accepts https://github.com/owner/repo[.git][/tree/...], git@github.com:owner/repo.git, or github.com/owner/repo. */
export function parseGithubUrl(input: string): ParsedRepo | null {
  let s = (input || "").trim();
  if (!s) return null;

  let host = "github.com";
  let owner = "";
  let repo = "";

  const ssh = s.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (ssh) {
    host = ssh[1];
    owner = ssh[2];
    repo = ssh[3];
  } else {
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""); // strip protocol
    const parts = s.split(/[/]/).filter(Boolean);
    if (parts.length >= 3 && parts[0].includes(".")) {
      host = parts[0];
      owner = parts[1];
      repo = parts[2];
    } else if (parts.length >= 2 && !parts[0].includes(".")) {
      // bare "owner/repo" — assume github.com
      owner = parts[0];
      repo = parts[1];
    } else {
      return null;
    }
    repo = repo.replace(/\.git$/i, "");
  }

  if (!owner || !repo) return null;
  // Only github.com supported for now (clone-by-token flow is github-specific).
  if (!/(^|\.)github\.com$/i.test(host)) return null;

  return {
    host,
    owner,
    repo,
    cloneUrl: `https://${host}/${owner}/${repo}.git`,
    webUrl: `https://${host}/${owner}/${repo}`,
  };
}

/* ---------------- clone ---------------- */

export async function cloneRepo(
  repo: ParsedRepo,
  dest: string,
  token?: string | null
): Promise<{ ok: boolean; error?: string; branch?: string }> {
  await fs.mkdir(path.dirname(dest), { recursive: true });

  // Don't clobber an existing workspace.
  try {
    const entries = await fs.readdir(dest);
    if (entries.length) return { ok: false, error: "A workspace folder for this repo already exists. Rename or remove it first." };
  } catch {
    /* dest doesn't exist yet — good */
  }

  const authUrl = token
    ? `https://x-access-token:${encodeURIComponent(token)}@${repo.host}/${repo.owner}/${repo.repo}.git`
    : repo.cloneUrl;

  try {
    await exec("git", ["clone", "--depth", "1", authUrl, dest], {
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 64,
    });
  } catch (e: any) {
    const msg = String(e?.stderr || e?.message || "");
    if (/authentication failed|could not read username|invalid username or password|403/i.test(msg)) {
      return { ok: false, error: "Clone failed — the repo is private or the token lacks access. Connect a GitHub token with repo read access." };
    }
    if (/not found|repository .* not found|404|does not exist/i.test(msg)) {
      return { ok: false, error: "Repository not found. Check the URL (and access, if it's private)." };
    }
    return { ok: false, error: `git clone failed: ${msg.slice(0, 240)}` };
  }

  // Strip any embedded credentials from the stored remote.
  try {
    await exec("git", ["remote", "set-url", "origin", repo.cloneUrl], { cwd: dest });
  } catch {
    /* non-fatal */
  }

  let branch: string | undefined;
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dest });
    branch = stdout.trim();
  } catch {
    /* non-fatal */
  }

  return { ok: true, branch };
}

/* ---------------- stack detection ---------------- */

export interface StackDetection {
  summary: string;
  languages: string[];
  /** Frameworks + notable services (Supabase, Stripe, Clerk, …). */
  frameworks: string[];
  packageManager?: string;
  choices: StackChoice[];
  readme: string;
  fileTree: string[];
  packageJson?: { name?: string; description?: string; scripts?: Record<string, string>; dependencies?: string[]; devDependencies?: string[] };
  hasTests: boolean;
}

export async function detectStack(dir: string): Promise<StackDetection> {
  const read = async (f: string) => {
    try {
      return await fs.readFile(path.join(dir, f), "utf8");
    } catch {
      return null;
    }
  };
  const exists = async (f: string) => {
    try {
      await fs.access(path.join(dir, f));
      return true;
    } catch {
      return false;
    }
  };

  let topLevel: string[] = [];
  try {
    topLevel = (await fs.readdir(dir)).filter((n) => n !== ".git");
  } catch {
    /* empty */
  }

  const readme = (await read("README.md")) || (await read("readme.md")) || (await read("README.markdown")) || "";
  const pkgRaw = await read("package.json");
  let pkg: any = null;
  try {
    pkg = pkgRaw ? JSON.parse(pkgRaw) : null;
  } catch {
    /* malformed package.json — ignore */
  }
  const deps: Record<string, string> = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  const has = (n: string) => Object.prototype.hasOwnProperty.call(deps, n);

  const languages = new Set<string>();
  if (await exists("tsconfig.json")) languages.add("TypeScript");
  if (pkg && !languages.has("TypeScript")) languages.add("JavaScript");
  if ((await exists("requirements.txt")) || (await exists("pyproject.toml")) || (await exists("Pipfile"))) languages.add("Python");
  if (await exists("go.mod")) languages.add("Go");
  if (await exists("Cargo.toml")) languages.add("Rust");
  if (await exists("Gemfile")) languages.add("Ruby");
  if ((await exists("pom.xml")) || (await exists("build.gradle"))) languages.add("Java");
  if (await exists("composer.json")) languages.add("PHP");

  const frameworks: string[] = [];
  if (has("next")) frameworks.push("Next.js");
  if (has("react") && !has("next")) frameworks.push("React");
  if (has("vue") || has("nuxt")) frameworks.push(has("nuxt") ? "Nuxt" : "Vue");
  if (has("@angular/core")) frameworks.push("Angular");
  if (has("svelte") || has("@sveltejs/kit")) frameworks.push("Svelte");
  if (has("express")) frameworks.push("Express");
  if (has("fastify")) frameworks.push("Fastify");
  if (has("@nestjs/core")) frameworks.push("NestJS");
  if (has("vite") && !frameworks.length) frameworks.push("Vite");
  if (has("tailwindcss")) frameworks.push("Tailwind CSS");
  if (await exists("manage.py")) frameworks.push("Django");

  const services: string[] = [];
  if (has("@supabase/supabase-js")) services.push("Supabase");
  if (has("@prisma/client") || has("prisma")) services.push("Prisma");
  if (has("drizzle-orm")) services.push("Drizzle");
  if (has("@clerk/nextjs") || has("@clerk/clerk-react") || has("@clerk/clerk-js")) services.push("Clerk");
  if (has("mongodb") || has("mongoose")) services.push("MongoDB");
  if (has("stripe") || has("@stripe/stripe-js")) services.push("Stripe");

  let packageManager: string | undefined;
  if (await exists("pnpm-lock.yaml")) packageManager = "pnpm";
  else if (await exists("yarn.lock")) packageManager = "yarn";
  else if (await exists("bun.lockb")) packageManager = "bun";
  else if (await exists("package-lock.json")) packageManager = "npm";

  const hasTests =
    (await exists("__tests__")) ||
    (await exists("tests")) ||
    (await exists("test")) ||
    has("jest") ||
    has("vitest") ||
    has("@playwright/test") ||
    has("cypress");

  const choices: StackChoice[] = [];
  const pushChoice = (slot: string, choice: string) => {
    if (choice) choices.push({ slot, choice, rationale: "Detected from the imported repository." });
  };
  pushChoice(
    "frontend",
    frameworks.find((f) => ["Next.js", "React", "Vue", "Nuxt", "Angular", "Svelte"].includes(f)) ||
      (frameworks.includes("Vite") ? "Vite" : "")
  );
  pushChoice(
    "backend",
    frameworks.find((f) => ["Express", "Fastify", "NestJS", "Django"].includes(f)) || (has("next") ? "Next.js API routes" : "")
  );
  pushChoice("database", services.find((s) => ["Supabase", "Prisma", "Drizzle", "MongoDB"].includes(s)) || "");
  pushChoice("auth", services.find((s) => ["Clerk", "Supabase"].includes(s)) || "");
  pushChoice("payments", services.includes("Stripe") ? "Stripe" : "");
  pushChoice("language", Array.from(languages)[0] || "");

  const langArr = Array.from(languages);
  const allFrameworks = [...frameworks, ...services];
  const summaryParts: string[] = [];
  if (frameworks.length) summaryParts.push(frameworks.join(" + "));
  if (langArr.length) summaryParts.push(langArr.join(", "));
  if (services.length) summaryParts.push(`services: ${services.join(", ")}`);
  if (packageManager) summaryParts.push(packageManager);
  const summary = summaryParts.join(" · ") || "Stack not auto-detected — see the repository contents.";

  return {
    summary,
    languages: langArr,
    frameworks: allFrameworks,
    packageManager,
    choices,
    readme: readme.slice(0, 8000),
    fileTree: topLevel.slice(0, 60),
    packageJson: pkg
      ? {
          name: pkg.name,
          description: pkg.description,
          scripts: pkg.scripts,
          dependencies: Object.keys(pkg.dependencies || {}),
          devDependencies: Object.keys(pkg.devDependencies || {}),
        }
      : undefined,
    hasTests,
  };
}

/* ---------------- LLM comprehension ---------------- */

/** Reverse-engineer a downstream-compatible product-spec from the existing code. */
export async function comprehendRepo(args: {
  title: string;
  webUrl: string;
  detection: StackDetection;
}): Promise<Record<string, unknown>> {
  const { title, webUrl, detection } = args;
  const provider = activeProvider();

  const context = [
    `You are reverse-engineering a product spec from an EXISTING, already-built codebase imported from GitHub (${webUrl}).`,
    `Repository name: ${title}`,
    detection.packageJson?.description ? `package.json description: ${detection.packageJson.description}` : "",
    `Detected stack: ${detection.summary}`,
    detection.frameworks.length ? `Frameworks/services: ${detection.frameworks.join(", ")}` : "",
    detection.packageJson?.scripts ? `npm scripts: ${JSON.stringify(detection.packageJson.scripts)}` : "",
    detection.fileTree.length ? `Top-level files: ${detection.fileTree.join(", ")}` : "",
    detection.hasTests ? "The repo has a test suite." : "",
    "",
    "README:",
    detection.readme || "(no README found)",
  ]
    .filter(Boolean)
    .join("\n");

  return provider.completeJson<Record<string, unknown>>({
    system:
      "You are a pragmatic Product Owner. You are given an EXISTING codebase (README + structure + detected stack) and must infer the product spec it already implements. Describe the product AS IT EXISTS today — its real problem, target users, and the features it has SHIPPED (put implemented/visible capabilities in must_have_features). Use nice_to_have_features for clear gaps or obvious next steps. Ground every claim in the evidence provided; where the repo is silent, make a reasonable inference and record the uncertainty in open_questions. Do NOT invent features the code clearly does not have. The recommendation should focus on where to take this existing product next.",
    effort: "high",
    schema: SPEC_SCHEMA,
    messages: [
      {
        role: "user",
        content: context + "\n\nWrite the structured product spec describing what this codebase already is, and where it could go next.",
      },
    ],
  });
}

/* ---------------- launch guide for imported repos ---------------- */

export function buildImportLaunchGuide(args: { title: string; dest: string; repo: ParsedRepo; detection: StackDetection }): string {
  const { title, dest, repo, detection } = args;
  const pm = detection.packageManager || "npm";
  const installCmd = pm === "npm" ? "npm install" : `${pm} install`;
  const devScript = detection.packageJson?.scripts?.dev ? `${pm} run dev` : detection.packageJson?.scripts?.start ? `${pm} start` : "(see the project README)";
  return [
    `# ${title} — imported from GitHub`,
    "",
    `This project was imported from **${repo.webUrl}** and cloned into your app workspace. The repository IS the build workspace — make changes here and they're real.`,
    "",
    `**Detected stack:** ${detection.summary}`,
    "",
    "## Run it locally",
    "```bash",
    `cd "${dest}"`,
    installCmd,
    devScript,
    "```",
    "",
    "## Iterate on it through the pipeline",
    `- **Direct edits with Claude Code:** \`cd "${dest}" && claude\` — the agent works in the cloned repo.`,
    "- **Full cycle:** run **QA → Deployment → Marketing** on this existing product, or open the **Iteration** phase to plan and build the next set of changes as a new cycle.",
    "",
    "The product spec was reverse-engineered from the code by the AI engine — review it in the Product Owner phase and refine it if anything's off before you build on top.",
  ].join("\n");
}
