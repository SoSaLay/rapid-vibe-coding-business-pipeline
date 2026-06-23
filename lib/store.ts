/**
 * Artifact spine + project store.
 *
 * The artifact envelope is the ONLY contract shared across phases. Each phase
 * reads the envelopes it depends on and writes a new one. Artifacts are stored
 * as versioned JSON files on disk so the whole pipeline is inspectable and
 * git-diffable (data/ is gitignored for privacy).
 *
 *   data/projects/<project_id>/meta.json
 *   data/projects/<project_id>/artifacts/<artifact_type>.v<n>.json
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { PHASES, PhaseId, FIRST_PHASE } from "./pipeline";

/** DATA_DIR override lets demo mode use a separate store (e.g. data-demo/) without touching real projects. */
const DATA_ROOT = path.join(process.cwd(), process.env.DATA_DIR || "data");
const PROJECTS_ROOT = path.join(DATA_ROOT, "projects");

export type ArtifactStatus = "draft" | "complete" | "rejected";

export interface ArtifactEnvelope<T = unknown> {
  project_id: string;
  phase: PhaseId;
  artifact_type: string;
  version: number;
  status: ArtifactStatus;
  created_at: string;
  /** artifact refs this was built from, e.g. ["raw-idea@1"] */
  inputs: string[];
  payload: T;
  links?: Record<string, string>;
}

export type PhaseState = "locked" | "available" | "active" | "complete" | "skipped";

export interface ProjectMeta {
  id: string;
  title: string;
  /** Idea-type label from capture (see lib/idea-types.ts). Missing on legacy projects = web-app. */
  idea_type?: string;
  /** Whether the owner has explicitly labeled the idea type (via the "Label me" dropdown).
   * Missing (legacy/imported) = treated as labeled so the stored type shows as-is. */
  labeled?: boolean;
  created_at: string;
  updated_at: string;
  current_phase: PhaseId;
  phase_status: Record<string, PhaseState>;
  /** Iteration loop counter. Missing on legacy projects = 1 (first pass). */
  cycle?: number;
  /** Archived = pipeline stopped by the owner at the Iteration gate. Reversible; nothing is deleted. */
  archived?: boolean;
  archived_at?: string;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function projectDir(id: string) {
  return path.join(PROJECTS_ROOT, id);
}

function artifactsDir(id: string) {
  return path.join(projectDir(id), "artifacts");
}

function freshPhaseStatus(): Record<string, PhaseState> {
  const status: Record<string, PhaseState> = {};
  PHASES.forEach((p, i) => {
    status[p.id] = i === 0 ? "active" : "locked";
  });
  return status;
}

export async function createProject(title: string, ideaType?: string): Promise<ProjectMeta> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id,
    title: title.trim() || "Untitled idea",
    idea_type: ideaType,
    created_at: now,
    updated_at: now,
    current_phase: FIRST_PHASE,
    phase_status: freshPhaseStatus(),
  };
  await ensureDir(artifactsDir(id));
  await writeMeta(meta);
  return meta;
}

export async function writeMeta(meta: ProjectMeta): Promise<void> {
  meta.updated_at = new Date().toISOString();
  await ensureDir(projectDir(meta.id));
  await fs.writeFile(path.join(projectDir(meta.id), "meta.json"), JSON.stringify(meta, null, 2), "utf8");
}

export async function getProject(id: string): Promise<ProjectMeta | null> {
  try {
    const raw = await fs.readFile(path.join(projectDir(id), "meta.json"), "utf8");
    return JSON.parse(raw) as ProjectMeta;
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<ProjectMeta[]> {
  try {
    const ids = await fs.readdir(PROJECTS_ROOT);
    const metas = await Promise.all(ids.map((id) => getProject(id)));
    return metas
      .filter((m): m is ProjectMeta => m !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}

async function nextVersion(projectId: string, artifactType: string): Promise<number> {
  try {
    const files = await fs.readdir(artifactsDir(projectId));
    const versions = files
      .filter((f) => f.startsWith(`${artifactType}.v`) && f.endsWith(".json"))
      .map((f) => parseInt(f.replace(`${artifactType}.v`, "").replace(".json", ""), 10))
      .filter((n) => !Number.isNaN(n));
    return versions.length ? Math.max(...versions) + 1 : 1;
  } catch {
    return 1;
  }
}

export async function saveArtifact<T>(args: {
  projectId: string;
  phase: PhaseId;
  artifactType: string;
  payload: T;
  status?: ArtifactStatus;
  inputs?: string[];
  links?: Record<string, string>;
}): Promise<ArtifactEnvelope<T>> {
  const version = await nextVersion(args.projectId, args.artifactType);
  const envelope: ArtifactEnvelope<T> = {
    project_id: args.projectId,
    phase: args.phase,
    artifact_type: args.artifactType,
    version,
    status: args.status ?? "complete",
    created_at: new Date().toISOString(),
    inputs: args.inputs ?? [],
    payload: args.payload,
    links: args.links,
  };
  await ensureDir(artifactsDir(args.projectId));
  await fs.writeFile(
    path.join(artifactsDir(args.projectId), `${args.artifactType}.v${version}.json`),
    JSON.stringify(envelope, null, 2),
    "utf8"
  );
  return envelope;
}

export async function listArtifacts(projectId: string): Promise<ArtifactEnvelope[]> {
  try {
    const files = await fs.readdir(artifactsDir(projectId));
    const items = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const raw = await fs.readFile(path.join(artifactsDir(projectId), f), "utf8");
          return JSON.parse(raw) as ArtifactEnvelope;
        })
    );
    return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  } catch {
    return [];
  }
}

/**
 * Per-phase working state (e.g. the Product Owner clarification dialogue) — a
 * mutable scratchpad that lives between the artifacts a phase consumes and the
 * artifact it ultimately produces.
 */
function phaseStateDir(id: string) {
  return path.join(projectDir(id), "phase-state");
}

export async function savePhaseState<T>(projectId: string, phaseId: PhaseId, state: T): Promise<void> {
  await ensureDir(phaseStateDir(projectId));
  await fs.writeFile(path.join(phaseStateDir(projectId), `${phaseId}.json`), JSON.stringify(state, null, 2), "utf8");
}

export async function getPhaseState<T>(projectId: string, phaseId: PhaseId): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(phaseStateDir(projectId), `${phaseId}.json`), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Project-wide settings (not phase-specific): the chosen UI generation engine
 * and the locked brand direction. Set early (Pre-Marketing) and read everywhere.
 */
export interface ProjectSettings {
  /** Which engine renders UI screens: "google-stitch" | "claude-html". Unset = auto. */
  designEngine?: string;
  /** The chosen creative direction, seeded into asset + UI prompts across phases. */
  brandDirection?: Record<string, unknown>;
  /**
   * Whether this product uses email (waitlist/launch/product/marketing broadcasts).
   * Decided once at Pre-Marketing and read everywhere. Unset = undecided (prompt the founder);
   * true = opted in (email surfaces appear); false = explicitly off (every email surface hidden).
   */
  emailEnabled?: boolean;
  /** Which email provider the broadcasts go through. Defaults to "resend". */
  emailProvider?: string;
}

function settingsPath(id: string) {
  return path.join(projectDir(id), "settings.json");
}

export async function getProjectSettings(projectId: string): Promise<ProjectSettings> {
  try {
    return JSON.parse(await fs.readFile(settingsPath(projectId), "utf8")) as ProjectSettings;
  } catch {
    return {};
  }
}

export async function saveProjectSettings(projectId: string, patch: ProjectSettings): Promise<ProjectSettings> {
  const current = await getProjectSettings(projectId);
  const next = { ...current, ...patch };
  await ensureDir(projectDir(projectId));
  await fs.writeFile(settingsPath(projectId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function latestArtifact(projectId: string, artifactType: string): Promise<ArtifactEnvelope | null> {
  const all = await listArtifacts(projectId);
  const matching = all.filter((a) => a.artifact_type === artifactType);
  return matching.length ? matching[matching.length - 1] : null;
}

/** Mark a phase complete and unlock the next phase. */
export async function completePhase(projectId: string, phase: PhaseId): Promise<ProjectMeta | null> {
  const meta = await getProject(projectId);
  if (!meta) return null;
  meta.phase_status[phase] = "complete";
  const idx = PHASES.findIndex((p) => p.id === phase);
  const next = PHASES[idx + 1];
  if (next) {
    meta.phase_status[next.id] = "active";
    meta.current_phase = next.id;
  }
  await writeMeta(meta);
  return meta;
}

/** Remove a phase's working scratchpad (used when a new cycle restarts a phase fresh). */
export async function clearPhaseState(projectId: string, phaseId: PhaseId): Promise<void> {
  try {
    await fs.unlink(path.join(phaseStateDir(projectId), `${phaseId}.json`));
  } catch {
    /* nothing to clear */
  }
}

/**
 * Iteration loop-back: start the next cycle at the Product Owner.
 * Business Owner stays complete (the idea exists; the check-in data is the new
 * raw input). Product Owner becomes active with a fresh dialogue; everything
 * downstream re-locks. Artifacts are never touched — re-runs produce v2+.
 */
export async function startNextCycle(projectId: string): Promise<ProjectMeta | null> {
  const meta = await getProject(projectId);
  if (!meta) return null;
  meta.cycle = (meta.cycle ?? 1) + 1;
  const poIdx = PHASES.findIndex((p) => p.id === "product-owner");
  PHASES.forEach((p, i) => {
    if (i === poIdx) meta.phase_status[p.id] = "active";
    else if (i > poIdx) meta.phase_status[p.id] = "locked";
  });
  meta.current_phase = "product-owner";
  await writeMeta(meta);
  await clearPhaseState(projectId, "product-owner");
  return meta;
}

/** Archive (or unarchive) a project. Flag-only — every file stays on disk. */
export async function setArchived(projectId: string, archived: boolean): Promise<ProjectMeta | null> {
  const meta = await getProject(projectId);
  if (!meta) return null;
  meta.archived = archived;
  meta.archived_at = archived ? new Date().toISOString() : undefined;
  await writeMeta(meta);
  return meta;
}

/**
 * PERMANENTLY delete a project and everything under its directory. Irreversible —
 * the API gates this behind an explicit type-the-name confirmation. Returns false
 * if the project doesn't exist.
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  const dir = projectDir(projectId);
  // Defense in depth: never let an id escape PROJECTS_ROOT, even though ids are UUIDs.
  const resolved = path.resolve(dir);
  if (path.dirname(resolved) !== path.resolve(PROJECTS_ROOT)) return false;
  if (!(await getProject(projectId))) return false;
  await fs.rm(resolved, { recursive: true, force: true });
  return true;
}

/** Skip an OPTIONAL phase and unlock the next one (no artifact produced). */
export async function skipPhase(projectId: string, phase: PhaseId): Promise<ProjectMeta | null> {
  const meta = await getProject(projectId);
  if (!meta) return null;
  const def = PHASES.find((p) => p.id === phase);
  if (def?.gate !== "optional") return meta; // only optional phases may be skipped
  meta.phase_status[phase] = "skipped";
  const idx = PHASES.findIndex((p) => p.id === phase);
  const next = PHASES[idx + 1];
  if (next) {
    meta.phase_status[next.id] = "active";
    meta.current_phase = next.id;
  }
  await writeMeta(meta);
  return meta;
}
