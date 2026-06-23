import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { createProject, saveArtifact, savePhaseState, getProject, writeMeta, deleteProject } from "@/lib/store";
import { isValidIdeaType } from "@/lib/idea-types";
import { detectStack, comprehendRepo, buildImportLaunchGuide, type ParsedRepo } from "@/lib/github/import";
import { workspacePath, workspaceExists } from "@/lib/workspace";
import type { PhaseId } from "@/lib/pipeline";

/** Directories never worth copying into the workspace. */
const SKIP = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo", ".cache", ".vercel", ".DS_Store",
]);

export async function importLocalProject(src: string, ideaType: string = "web-app") {
  // Validate the source is an existing directory.
  try {
    const stat = await fs.stat(src);
    if (!stat.isDirectory()) throw new Error("That path is a file, not a folder.");
  } catch {
    throw new Error(`No folder found at ${src}.`);
  }

  const title = path.basename(src);
  const dest = workspacePath(title);

  if (src === dest) throw new Error("That folder is already the app workspace.");
  if (await workspaceExists(title)) {
    throw new Error(`A workspace named "${title}" already exists. Rename the folder or remove the old one.`);
  }

  const project = await createProject(title, ideaType);
  const cleanup = async () => {
    await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
    await deleteProject(project.id).catch(() => {});
  };

  try {
    // Copy the project into the workspace, skipping heavy/generated directories.
    await fs.cp(src, dest, {
      recursive: true,
      filter: (s) => !SKIP.has(path.basename(s)),
    });

    const detection = await detectStack(dest);

    let spec: Record<string, unknown>;
    try {
      spec = await comprehendRepo({ title, webUrl: src, detection });
    } catch (e: any) {
      await cleanup();
      const msg = String(e?.message || "");
      const friendly = /not connected|anthropic|api key/i.test(msg)
        ? "Connect your Claude (Anthropic) key first — importing reads the code with the AI engine."
        : msg || "Failed to analyze the project.";
      throw new Error(friendly);
    }

    const repo: ParsedRepo = { host: "local", owner: "local", repo: title, cloneUrl: src, webUrl: src };

    await saveArtifact({
      projectId: project.id,
      phase: "business-owner",
      artifactType: "raw-idea",
      payload: {
        source: "local-import",
        input_method: "local",
        title,
        raw_text: `Imported from local folder ${src}\n\n${detection.packageJson?.description || detection.readme.split("\n").slice(0, 6).join("\n") || "(no description)"}`,
        idea_type: ideaType,
      },
    });

    await saveArtifact({
      projectId: project.id,
      phase: "product-owner",
      artifactType: "product-spec",
      payload: { ...spec, idea_type: ideaType, imported_from: src },
      inputs: ["raw-idea"],
    });

    await saveArtifact({
      projectId: project.id,
      phase: "engineering",
      artifactType: "stack-selection",
      payload: {
        choices: detection.choices,
        detected: {
          summary: detection.summary,
          frameworks: detection.frameworks,
          languages: detection.languages,
          packageManager: detection.packageManager,
        },
        source: "imported-local",
      },
      inputs: ["product-spec"],
    });

    await saveArtifact({
      projectId: project.id,
      phase: "engineering",
      artifactType: "task-graph",
      payload: { workspace_path: dest, imported: true, milestones: [] },
      inputs: ["product-spec", "stack-selection"],
    });

    const launchGuide = buildImportLaunchGuide({ title, dest, repo, detection });
    await saveArtifact({
      projectId: project.id,
      phase: "engineering",
      artifactType: "build-manifest",
      payload: {
        workspace_path: dest,
        stack: detection.choices,
        tasks_done: 0,
        tasks_total: 0,
        forced: false,
        imported: true,
        imported_from: src,
        launch_guide: launchGuide,
        recent_commits: [],
      },
      inputs: ["stack-selection", "task-graph"],
    });

    await savePhaseState(project.id, "engineering", {
      stack: detection.choices,
      proposal: {
        choices: detection.choices,
        architecture_summary: detection.summary,
        mermaid_diagram: "",
        key_decisions: ["Imported from an existing local project — the stack was detected, not proposed."],
      },
      workspace: { path: dest, startCommand: `cd "${dest}" && claude`, gitInitialized: false },
    });

    const meta = await getProject(project.id);
    if (meta) {
      const status: Record<PhaseId, "complete" | "available"> = {
        "business-owner": "complete",
        "product-owner": "complete",
        "idea-validation": "available",
        "pre-marketing": "available",
        "product-design": "available",
        engineering: "complete",
        qa: "available",
        deployment: "available",
        "marketing-sales": "available",
        operations: "available",
        iteration: "available",
      };
      meta.phase_status = status;
      meta.current_phase = "engineering";
      meta.labeled = isValidIdeaType(ideaType);
      (meta as any).imported = true;
      (meta as any).imported_from = src;
      await writeMeta(meta);
    }

    return { project: meta ?? project, detection: { summary: detection.summary, frameworks: detection.frameworks } };
  } catch (e: any) {
    await cleanup();
    throw e;
  }
}