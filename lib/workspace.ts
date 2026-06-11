/**
 * App workspace generator (Phase 6).
 *
 * Every built app lives in its own folder under the user's home directory —
 * named in full so there's never any mystery about where apps live:
 *   ~/Rapid Vibe Coding Apps/<project-slug>/
 *
 * The workspace receives the briefing package (CLAUDE.md, TASKS.md, SPECS/)
 * and is git-initialized. The coding agent scaffolds the actual app inside it
 * as Milestone 1 — the orchestrator deliberately writes briefing only, so
 * workspace creation is instant and offline.
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

export const APPS_ROOT = path.join(os.homedir(), "Rapid Vibe Coding Apps");

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "app"
  );
}

export function workspacePath(projectTitle: string): string {
  return path.join(APPS_ROOT, slugify(projectTitle));
}

const WORKSPACE_GITIGNORE = `node_modules/
.next/
out/
dist/
.env*.local
.env
*.log
.DS_Store
`;

export interface WorkspaceFiles {
  claudeMd: string;
  tasksMd: string;
  productSpec: Record<string, any>;
  designSpec: Record<string, any> | null;
}

export interface WorkspaceResult {
  path: string;
  startCommand: string;
  gitInitialized: boolean;
}

export async function createWorkspace(projectTitle: string, files: WorkspaceFiles): Promise<WorkspaceResult> {
  const dir = workspacePath(projectTitle);
  const specsDir = path.join(dir, "SPECS");
  await fs.mkdir(specsDir, { recursive: true });

  await fs.writeFile(path.join(dir, "CLAUDE.md"), files.claudeMd, "utf8");
  await fs.writeFile(path.join(dir, "TASKS.md"), files.tasksMd, "utf8");
  await fs.writeFile(path.join(dir, ".gitignore"), WORKSPACE_GITIGNORE, "utf8");
  await fs.writeFile(path.join(specsDir, "product-spec.json"), JSON.stringify(files.productSpec, null, 2), "utf8");
  if (files.designSpec) {
    await fs.writeFile(path.join(specsDir, "design-spec.json"), JSON.stringify(files.designSpec, null, 2), "utf8");
  }

  // Git init + initial commit; non-fatal if git is unavailable.
  let gitInitialized = false;
  try {
    await exec("git", ["init"], { cwd: dir });
    await exec("git", ["add", "-A"], { cwd: dir });
    await exec("git", ["commit", "-m", "briefing: stack, specs, and task tracker from the pipeline"], { cwd: dir });
    gitInitialized = true;
  } catch {
    /* workspace still usable without git */
  }

  return {
    path: dir,
    startCommand: `cd "${dir}" && claude`,
    gitInitialized,
  };
}

/** Write (or overwrite) a file inside the workspace, creating parent dirs as needed. */
export async function writeWorkspaceFile(projectTitle: string, file: string, content: string): Promise<void> {
  const full = path.join(workspacePath(projectTitle), file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
}

export async function readWorkspaceFile(projectTitle: string, file: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(workspacePath(projectTitle), file), "utf8");
  } catch {
    return null;
  }
}

export async function workspaceExists(projectTitle: string): Promise<boolean> {
  try {
    await fs.access(workspacePath(projectTitle));
    return true;
  } catch {
    return false;
  }
}

/** Last few commits in the workspace, newest first. Empty if git is absent. */
export async function recentCommits(projectTitle: string, n = 5): Promise<string[]> {
  try {
    const { stdout } = await exec("git", ["log", `-${n}`, "--format=%h %s"], { cwd: workspacePath(projectTitle) });
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** GSD detection: returns phase progress if the workspace uses GSD's .planning/ layout. */
export async function detectGsd(projectTitle: string): Promise<{ detected: boolean; summary?: string }> {
  const roadmap = await readWorkspaceFile(projectTitle, path.join(".planning", "ROADMAP.md"));
  if (!roadmap) return { detected: false };
  const boxes = roadmap.match(/^- \[[ xX]\]/gm) || [];
  const done = roadmap.match(/^- \[[xX]\]/gm) || [];
  return { detected: true, summary: `GSD project detected — ${done.length}/${boxes.length} roadmap items complete.` };
}
