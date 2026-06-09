/**
 * Framework-pack layer.
 *
 * A reusable knowledge service: it discovers vendored pm-skills playbooks
 * (vendor/pm-skills/<plugin>/<skill>/SKILL.md), parses their frontmatter, and
 * exposes them as selectable "frameworks." Phases load the relevant ones into
 * the LLM's context so its output is shaped by proven PM frameworks instead of
 * generic reasoning. Built phase-agnostic so Market Research, GTM, etc. can
 * reuse it later — they just point at different plugins.
 */

import { promises as fs } from "fs";
import path from "path";

const VENDOR_ROOT = path.join(process.cwd(), "vendor", "pm-skills");

export interface Framework {
  id: string; // skill folder name, e.g. "value-proposition"
  plugin: string; // e.g. "pm-product-strategy"
  name: string;
  description: string;
  body: string; // the playbook content (frontmatter stripped)
}

export interface FrameworkSummary {
  id: string;
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
  const frameworks: Framework[] = [];
  let plugins: string[];
  try {
    plugins = await fs.readdir(VENDOR_ROOT);
  } catch {
    return [];
  }
  for (const plugin of plugins) {
    const skillsDir = path.join(VENDOR_ROOT, plugin);
    let stat;
    try {
      stat = await fs.stat(skillsDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let skills: string[];
    try {
      skills = await fs.readdir(skillsDir);
    } catch {
      continue;
    }
    for (const skill of skills) {
      const file = path.join(skillsDir, skill, "SKILL.md");
      try {
        const raw = await fs.readFile(file, "utf8");
        const { name, description, body } = parseFrontmatter(raw);
        frameworks.push({
          id: skill,
          plugin,
          name: name || skill,
          description: description || "",
          body,
        });
      } catch {
        // not a skill dir (e.g. LICENSE, ATTRIBUTION.md) — skip
      }
    }
  }
  cache = frameworks;
  return frameworks;
}

export async function frameworkCatalog(): Promise<FrameworkSummary[]> {
  const all = await loadFrameworks();
  return all.map(({ id, plugin, name, description }) => ({ id, plugin, name, description }));
}

export async function getFrameworks(ids: string[]): Promise<Framework[]> {
  const all = await loadFrameworks();
  return ids.map((id) => all.find((f) => f.id === id)).filter((f): f is Framework => !!f);
}

/** Render selected playbooks into a single context block for the LLM. */
export async function buildFrameworkContext(ids: string[]): Promise<string> {
  const frameworks = await getFrameworks(ids);
  if (frameworks.length === 0) return "";
  const blocks = frameworks.map(
    (f) => `### Playbook: ${f.name}\n(source: pm-skills/${f.plugin})\n\n${f.body}`
  );
  return (
    "You have the following proven PM playbooks to apply. Use their frameworks, " +
    "categories, and structure to make your questions and spec rigorous — adapt them to THIS idea, " +
    "do not just recite them:\n\n" +
    blocks.join("\n\n---\n\n")
  );
}
