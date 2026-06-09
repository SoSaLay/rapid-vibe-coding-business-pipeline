/**
 * Framework-pack layer.
 *
 * A reusable knowledge service: it discovers vendored playbooks under `vendor/`
 * (any source — pm-skills, marketing-skills, …), parses their frontmatter, and
 * exposes them as selectable "frameworks." Phases load the relevant ones into
 * the LLM's context so its output is shaped by proven frameworks instead of
 * generic reasoning.
 *
 * A playbook is any `.../SKILL.md` under `vendor/<source>/.../<skill>/SKILL.md`.
 * `source` = the top folder (e.g. "marketing-skills"); `id` = the skill folder.
 */

import { promises as fs } from "fs";
import path from "path";

const VENDOR_ROOT = path.join(process.cwd(), "vendor");

export interface Framework {
  id: string; // skill folder name, e.g. "copywriting"
  source: string; // vendor source, e.g. "marketing-skills" | "pm-skills"
  plugin: string; // grouping folder if present, else source
  name: string;
  description: string;
  body: string;
}

export interface FrameworkSummary {
  id: string;
  source: string;
  plugin: string;
  name: string;
  description: string;
}

function parseFrontmatter(raw: string): { name?: string; description?: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { body: raw };
  const front = match[1];
  const body = match[2].trim();
  const name = front.match(/^name:\s*"?(.*?)"?\s*$/m)?.[1];
  const description = front.match(/^description:\s*"?([\s\S]*?)"?\s*$/m)?.[1];
  return { name, description, body };
}

let cache: Framework[] | null = null;

export async function loadFrameworks(): Promise<Framework[]> {
  if (cache) return cache;
  let entries: string[];
  try {
    entries = (await fs.readdir(VENDOR_ROOT, { recursive: true })) as string[];
  } catch {
    return [];
  }
  const frameworks: Framework[] = [];
  for (const rel of entries) {
    if (!rel.endsWith(`${path.sep}SKILL.md`) && rel !== "SKILL.md") continue;
    const parts = rel.split(path.sep);
    if (parts.length < 2) continue;
    const source = parts[0];
    const id = parts[parts.length - 2]; // folder containing SKILL.md
    const plugin = parts.length > 3 ? parts[1] : source;
    try {
      const raw = await fs.readFile(path.join(VENDOR_ROOT, rel), "utf8");
      const { name, description, body } = parseFrontmatter(raw);
      frameworks.push({ id, source, plugin, name: name || id, description: description || "", body });
    } catch {
      /* skip unreadable */
    }
  }
  cache = frameworks;
  return frameworks;
}

export async function frameworkCatalog(source?: string): Promise<FrameworkSummary[]> {
  const all = await loadFrameworks();
  return all
    .filter((f) => !source || f.source === source)
    .map(({ id, source, plugin, name, description }) => ({ id, source, plugin, name, description }));
}

export async function getFrameworks(ids: string[]): Promise<Framework[]> {
  const all = await loadFrameworks();
  return ids.map((id) => all.find((f) => f.id === id)).filter((f): f is Framework => !!f);
}

/** Render selected playbooks into a single context block for the LLM. */
export async function buildFrameworkContext(ids: string[]): Promise<string> {
  const frameworks = await getFrameworks(ids);
  if (frameworks.length === 0) return "";
  const blocks = frameworks.map((f) => `### Playbook: ${f.name}\n(source: ${f.source})\n\n${f.body}`);
  return (
    "You have the following proven playbooks to apply. Use their frameworks, " +
    "categories, and structure to make your output rigorous — adapt them to THIS idea, do not just recite them:\n\n" +
    blocks.join("\n\n---\n\n")
  );
}
