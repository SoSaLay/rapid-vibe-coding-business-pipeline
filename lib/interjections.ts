/**
 * Business-owner interjections (#8).
 *
 * At any generate-capable phase the owner can drop a raw note ("make the tone more
 * casual", "focus on enterprise"). The Product Owner refines that raw intent into a
 * clean directive, which is stored here per-phase and injected into that phase's next
 * generation call. The BO never bypasses the PO quality filter.
 *
 * Stored in its own file so it survives phases overwriting their working phase-state.
 *   data/projects/<id>/interjections.json  →  { [phaseId]: Interjection[] }
 */
import { promises as fs } from "fs";
import path from "path";

const DATA_ROOT = path.join(process.cwd(), process.env.DATA_DIR || "data");

export interface Interjection {
  raw: string;
  refined: string;
  at: string;
}

function interjFile(projectId: string): string {
  return path.join(DATA_ROOT, "projects", projectId, "interjections.json");
}

async function readAll(projectId: string): Promise<Record<string, Interjection[]>> {
  try {
    return JSON.parse(await fs.readFile(interjFile(projectId), "utf8"));
  } catch {
    return {};
  }
}

export async function listInterjections(projectId: string, phase: string): Promise<Interjection[]> {
  return (await readAll(projectId))[phase] || [];
}

export async function addInterjection(
  projectId: string,
  phase: string,
  entry: { raw: string; refined: string }
): Promise<Interjection> {
  const all = await readAll(projectId);
  const item: Interjection = { ...entry, at: new Date().toISOString() };
  all[phase] = [...(all[phase] || []), item];
  const file = interjFile(projectId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(all, null, 2), "utf8");
  return item;
}

/**
 * Refined directives for a phase, formatted for injection into the LLM context.
 * Returns "" when there are none, so callers can append unconditionally.
 */
export async function interjectionContext(projectId: string, phase: string): Promise<string> {
  const items = await listInterjections(projectId, phase);
  if (!items.length) return "";
  const lines = items.map((i, n) => `${n + 1}. ${i.refined}`).join("\n");
  return (
    `\n\n---\n\nBUSINESS OWNER DIRECTIVES (refined by the Product Owner — honor these in your output):\n${lines}`
  );
}
