/**
 * Skills (procedural memory): write one with the model from a short description,
 * or import an existing SKILL.md from GitHub — text only, never scripts — with a
 * security review the owner must sign off.
 */

import { activeProvider } from "../llm/registry";
import type { SkillDef } from "./design";

export function skillSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "skill"
  );
}

/** The SKILL.md file: YAML frontmatter (name, description) + the instructions. */
export function renderSkillMd(s: SkillDef): string {
  const esc = (v: string) => JSON.stringify(v.replace(/\s+/g, " ").trim());
  return `---\nname: ${skillSlug(s.name)}\ndescription: ${esc(s.description)}\n---\n\n${s.instructions.trim()}\n`;
}

export function parseSkillMd(md: string): { name: string; description: string; instructions: string } | null {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(md.trim());
  if (!m) return null;
  const field = (k: string) => {
    const v = new RegExp(`^${k}:\\s*(.+)$`, "m").exec(m[1])?.[1]?.trim() ?? "";
    return v.replace(/^["']|["']$/g, "");
  };
  const name = field("name");
  const description = field("description");
  if (!name || !description) return null;
  return { name, description, instructions: m[2].trim() };
}

const SKILL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "kebab-case, 2-4 words" },
    description: {
      type: "string",
      description: "What it does AND when to use it, in the third person, ≤40 words. This is all the agent sees before opening the skill.",
    },
    instructions: {
      type: "string",
      description: "Markdown: when to use, step-by-step how to do the job, rules and edge cases, and the facts the job needs. Plain English.",
    },
  },
  required: ["name", "description", "instructions"],
};

export async function writeSkill(args: { request: string; agentSummary: string; tools: string[] }): Promise<SkillDef> {
  const r = await activeProvider().completeJson<{ name: string; description: string; instructions: string }>({
    system:
      "You write Agent Skills: a SKILL.md an AI agent opens only when a task needs it. Make it a repeatable procedure for ONE job, " +
      "in plain English, using only the agent's existing tools. Keep it tight: what to do, in what order, what to avoid, and the facts it needs.",
    effort: "medium",
    schema: SKILL_SCHEMA,
    messages: [
      {
        role: "user",
        content: `AGENT: ${args.agentSummary}\nTOOLS IT HAS: ${args.tools.join(", ") || "(none)"}\n\nTHE SKILL THE OWNER WANTS:\n${args.request}`,
      },
    ],
  });
  return { name: skillSlug(r.name), description: r.description, instructions: r.instructions, source: "written", enabled: true };
}

/** Recommend 1-3 skills for a new design (run alongside the other design calls). */
export async function recommendSkills(args: { jobText: string; tools: string[] }): Promise<SkillDef[]> {
  const r = await activeProvider().completeJson<{ skills: { name: string; description: string; instructions: string }[] }>({
    system:
      "You recommend Agent Skills for a new agent: 1-3 repeatable procedures it will need for its job (e.g. how to classify, how to write a reply in the house style). " +
      "Each is a SKILL.md the agent opens only when needed. Only what the job needs today; more can be added later.",
    effort: "medium",
    schema: { type: "object", additionalProperties: false, properties: { skills: { type: "array", items: SKILL_SCHEMA } }, required: ["skills"] },
    messages: [{ role: "user", content: `JOB:\n${args.jobText}\n\nTOOLS: ${args.tools.join(", ") || "(none yet)"}` }],
  });
  return (r.skills ?? []).slice(0, 3).map((s) => ({ name: skillSlug(s.name), description: s.description, instructions: s.instructions, source: "recommended" as const, enabled: true }));
}

/** GitHub blob/tree URLs → the raw SKILL.md URL. */
export function rawSkillUrl(url: string): string {
  const u = url.trim();
  const blob = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|tree)\/([^/]+)\/(.+)$/.exec(u);
  if (blob) {
    const p = blob[4].endsWith("SKILL.md") ? blob[4] : `${blob[4].replace(/\/$/, "")}/SKILL.md`;
    return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}/${p}`;
  }
  return u;
}

/** Security review of third-party skill text: anything that could run code, fetch things, or steer the agent. */
export function reviewSkill(md: string): string[] {
  const flags: string[] = [];
  const checks: [RegExp, string][] = [
    [/```(bash|sh|shell|zsh|powershell|python|js|javascript|ts)/i, "Contains code blocks the agent might try to run."],
    [/\b(curl|wget|Invoke-WebRequest|nc |netcat)\b/i, "Downloads or sends data over the network."],
    [/\b(eval|exec|subprocess|os\.system|child_process|rm -rf|chmod|sudo)\b/i, "Runs commands or changes files."],
    [/base64|\\x[0-9a-f]{2}|[A-Za-z0-9+/]{120,}={0,2}/i, "Contains encoded or obfuscated text."],
    [/ignore (all |the )?(previous|prior|above) instructions|disregard .*instructions|you are now/i, "Tries to override the agent's instructions."],
    [/\b(api[_-]?key|password|secret|token)\b/i, "Mentions keys, passwords or tokens."],
    [/scripts?\/[\w.-]+\.(py|sh|js|ts)/i, "Refers to script files (only the SKILL.md text is imported; scripts are not)."],
    [/https?:\/\/(?!github\.com|docs\.)[^\s)]+/i, "Links to outside sites."],
  ];
  for (const [re, msg] of checks) if (re.test(md)) flags.push(msg);
  return flags;
}

export async function importSkill(url: string): Promise<SkillDef> {
  const raw = rawSkillUrl(url);
  if (!/^https:\/\//.test(raw)) throw new Error("Use an https link to a SKILL.md (GitHub links work).");
  const res = await fetch(raw, { redirect: "follow" });
  if (!res.ok) throw new Error(`Couldn't fetch the skill (${res.status}).`);
  const text = (await res.text()).slice(0, 100_000);
  const parsed = parseSkillMd(text);
  if (!parsed) throw new Error("That file isn't a SKILL.md (it needs name and description at the top).");
  return {
    name: skillSlug(parsed.name),
    description: parsed.description,
    instructions: parsed.instructions,
    source: "imported",
    source_url: url,
    enabled: true,
    review: { flags: reviewSkill(text), approved: false },
  };
}
