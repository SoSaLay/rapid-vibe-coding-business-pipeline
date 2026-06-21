import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { createProject, saveArtifact, savePhaseState, getProject, writeMeta, deleteProject } from "@/lib/store";
import { isValidIdeaType } from "@/lib/idea-types";
import {
  parseGithubUrl,
  cloneRepo,
  detectStack,
  comprehendRepo,
  buildImportLaunchGuide,
  getGithubToken,
} from "@/lib/github/import";
import { workspacePath } from "@/lib/workspace";
import type { PhaseId } from "@/lib/pipeline";

/**
 * Import an existing GitHub repository as a BROWNFIELD project.
 *
 * The repo is cloned into the app workspace, its stack detected, and the LLM
 * reverse-engineers a product-spec. We then back-fill the upstream artifacts
 * (raw-idea, product-spec, stack-selection, task-graph, build-manifest) so the
 * create-phases read as complete and every downstream phase (QA, Deploy,
 * Marketing, Ops, Iteration) has its inputs. The founder lands on Engineering.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const parsed = parseGithubUrl(body.url || "");
  if (!parsed) {
    return NextResponse.json({ error: "Enter a valid GitHub repo URL, e.g. https://github.com/owner/repo." }, { status: 400 });
  }

  const ideaType = isValidIdeaType(body.ideaType) ? (body.ideaType as string) : "web-app";
  const title = parsed.repo;
  const dest = workspacePath(title);

  const project = await createProject(title, ideaType);

  const cleanup = async () => {
    await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
    await deleteProject(project.id).catch(() => {});
  };

  try {
    const token = (body.token && String(body.token).trim()) || (await getGithubToken());
    const clone = await cloneRepo(parsed, dest, token);
    if (!clone.ok) {
      await cleanup();
      return NextResponse.json({ error: clone.error }, { status: 400 });
    }

    const detection = await detectStack(dest);

    let spec: Record<string, unknown>;
    try {
      spec = await comprehendRepo({ title, webUrl: parsed.webUrl, detection });
    } catch (e: any) {
      await cleanup();
      const msg = String(e?.message || "");
      const friendly = /not connected|anthropic|api key/i.test(msg)
        ? "Connect your Claude (Anthropic) key first — importing reads the repo with the AI engine."
        : msg || "Failed to analyze the repository.";
      return NextResponse.json({ error: friendly }, { status: 400 });
    }

    // ---- Back-fill the upstream artifacts ----
    await saveArtifact({
      projectId: project.id,
      phase: "business-owner",
      artifactType: "raw-idea",
      payload: {
        source: "github-import",
        input_method: "github",
        title,
        raw_text: `Imported from ${parsed.webUrl}\n\n${detection.packageJson?.description || detection.readme.split("\n").slice(0, 6).join("\n") || "(no description)"}`,
        idea_type: ideaType,
        repo: { url: parsed.webUrl, owner: parsed.owner, name: parsed.repo, branch: clone.branch },
      },
      links: { source: parsed.webUrl },
    });

    await saveArtifact({
      projectId: project.id,
      phase: "product-owner",
      artifactType: "product-spec",
      payload: { ...spec, idea_type: ideaType, imported_from: parsed.webUrl },
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
        source: "imported-repo",
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

    const launchGuide = buildImportLaunchGuide({ title, dest, repo: parsed, detection });
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
        repo_url: parsed.webUrl,
        launch_guide: launchGuide,
        recent_commits: [],
      },
      inputs: ["stack-selection", "task-graph"],
    });

    // Seed the engineering phase scratchpad so the workspace + detected stack render.
    await savePhaseState(project.id, "engineering", {
      stack: detection.choices,
      proposal: {
        choices: detection.choices,
        architecture_summary: detection.summary,
        mermaid_diagram: "",
        key_decisions: ["Imported from an existing GitHub repository — the stack was detected, not proposed."],
      },
      workspace: { path: dest, startCommand: `cd "${dest}" && claude`, gitInitialized: true },
    });

    // Brownfield phase map: create-phases complete, everything else open, land on Engineering.
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
      (meta as any).imported = true;
      (meta as any).repo_url = parsed.webUrl;
      await writeMeta(meta);
    }

    return NextResponse.json(
      { project: meta ?? project, repo: parsed, detection: { summary: detection.summary, frameworks: detection.frameworks } },
      { status: 201 }
    );
  } catch (e: any) {
    await cleanup();
    return NextResponse.json({ error: e?.message || "Import failed." }, { status: 500 });
  }
}
