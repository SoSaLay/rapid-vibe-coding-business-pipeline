/**
 * Design-system reference library (Product Design phase).
 *
 * Catalogs the 138 vendored `DESIGN.md` reference systems under
 * `vendor/ux-ui-agent-skills/design-systems/` (see ATTRIBUTION.md there) so the
 * phase can pick 1–2 that fit the product and inject only those — never the
 * whole library — as concrete visual-direction grounding (colors, type, spacing).
 *
 * Deliberately separate from `lib/frameworks/`: these files aren't SKILL.md
 * playbooks, and selection is by catalog menu rather than framework ids.
 */

import { promises as fs } from "fs";
import path from "path";

const LIB_ROOT = path.join(process.cwd(), "vendor", "ux-ui-agent-skills", "design-systems");
const TASTE_PATH = path.join(process.cwd(), "vendor", "ux-ui-agent-skills", "taste", "design-taste.md");

export interface DesignSystemSummary {
  id: string; // folder name, e.g. "cal"
  name: string; // from the H1, e.g. "Cal.com"
  category: string; // e.g. "Productivity & SaaS"
  description: string;
}

export interface DesignSystem extends DesignSystemSummary {
  body: string; // full DESIGN.md content
}

function parseHeader(raw: string, id: string): Omit<DesignSystemSummary, "id"> {
  // Most files use "# Design System Inspired by X"; a few use a plain "# X" H1.
  const name =
    raw.match(/^#\s*Design System Inspired by\s*(.+)$/m)?.[1]?.trim() ||
    raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    id;
  const category = raw.match(/^>\s*Category:\s*(.+)$/m)?.[1]?.trim() || "";
  // The description is the blockquote line after the Category line.
  const description =
    raw
      .split("\n")
      .filter((l) => l.startsWith(">") && !/Category:/.test(l))
      .map((l) => l.replace(/^>\s*/, "").trim())
      .find(Boolean) || "";
  return { name, category, description };
}

let catalogCache: DesignSystemSummary[] | null = null;

export async function designSystemCatalog(): Promise<DesignSystemSummary[]> {
  if (catalogCache) return catalogCache;
  let dirs: string[];
  try {
    dirs = (await fs.readdir(LIB_ROOT, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const summaries: DesignSystemSummary[] = [];
  for (const id of dirs) {
    try {
      const raw = await fs.readFile(path.join(LIB_ROOT, id, "DESIGN.md"), "utf8");
      summaries.push({ id, ...parseHeader(raw, id) });
    } catch {
      /* skip folders without a DESIGN.md */
    }
  }
  catalogCache = summaries;
  return summaries;
}

export async function loadDesignSystems(ids: string[]): Promise<DesignSystem[]> {
  const out: DesignSystem[] = [];
  for (const id of ids) {
    try {
      const raw = await fs.readFile(path.join(LIB_ROOT, id, "DESIGN.md"), "utf8");
      out.push({ id, ...parseHeader(raw, id), body: raw });
    } catch {
      /* skip unknown ids */
    }
  }
  return out;
}

/** Render the selected reference systems into a context block for the LLM. */
export async function buildDesignSystemContext(ids: string[]): Promise<string> {
  const systems = await loadDesignSystems(ids);
  if (systems.length === 0) return "";
  const blocks = systems.map((s) => `### Reference design system: ${s.name} (${s.category})\n\n${s.body}`);
  return (
    "Ground the visual direction in the following reference design system(s). Inherit their concrete " +
    "tokens (colors, typography, spacing) and overall feel — adapted to THIS product, not copied blindly:\n\n" +
    blocks.join("\n\n---\n\n")
  );
}

/** The anti-slop judgment layer, injected when generating screen mockups. */
export async function loadDesignTaste(): Promise<string> {
  try {
    return await fs.readFile(TASTE_PATH, "utf8");
  } catch {
    return "";
  }
}
