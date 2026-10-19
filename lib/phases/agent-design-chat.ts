/**
 * Agent Design chat: the owner asks for a change in plain words ("swap this tool",
 * "add a tool that…", "use a cheaper model") and the pipeline's AI edits the draft
 * design. The model returns a small change set, applied here, so untouched parts
 * of the design never drift. New skills go through writeSkill like the Skills editor.
 */

import { activeProvider } from "../llm/registry";
import type { AgentDesign, LoginId, ToolContract } from "../agent/design";
import type { FilledLogic } from "../agent/types";
import { writeSkill, skillSlug } from "../agent/skills";
import { DATA_SOURCE_SCHEMA, DESIGN_SYSTEM, MODEL_IDS, TOOL_SCHEMA, specToAgentText } from "./agent-design";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

const LOGINS: LoginId[] = ["machine-key", "supabase-auth", "neon-auth", "clerk"];

const CHANGES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: {
      type: "string",
      description: "To the owner: what you changed, in 1-2 short plain sentences. If nothing could change, say why and what to do instead.",
    },
    model: { type: "string", description: `New model id (one of: ${MODEL_IDS.join(", ")}), or "" to keep it.` },
    tools_upsert: {
      type: "array",
      description: "Tools to add, or to replace in full (same name = replace). Only tools that change.",
      items: TOOL_SCHEMA,
    },
    tools_remove: { type: "array", items: { type: "string" }, description: "Names of tools to remove." },
    data_sources_upsert: { type: "array", items: DATA_SOURCE_SCHEMA, description: "Data sources to add or replace (same name = replace)." },
    data_sources_remove: { type: "array", items: { type: "string" }, description: "Names of data sources to remove." },
    skills_add: {
      type: "array",
      items: { type: "string" },
      description: "One short request per NEW skill to write, e.g. 'Write replies in our friendly tone'.",
    },
    skills_remove: { type: "array", items: { type: "string" }, description: "Names of skills to remove." },
    step_limit: { type: "integer", description: "New step limit, or 0 to keep it." },
    fallback: { type: "string", description: "New human hand-off, or \"\" to keep it." },
    login: { type: "string", description: `Who uses it / login (one of: ${LOGINS.join(", ")}), or "" to keep it.` },
    summary: { type: "string", description: "New 1-2 sentence summary if the job changed, or \"\" to keep it." },
    tool_bodies: {
      type: "array",
      description: "ONLY when TOOL CODE is given: tools whose Python body must change (full new body, same signature).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, python_body: { type: "string" } },
        required: ["name", "python_body"],
      },
    },
    prompt_rules: { type: "array", items: { type: "string" }, description: "ONLY when TOOL CODE is given: rules to add to the agent's instructions." },
  },
  required: ["reply", "model", "tools_upsert", "tools_remove", "data_sources_upsert", "data_sources_remove", "skills_add", "skills_remove", "step_limit", "fallback", "login", "summary", "tool_bodies", "prompt_rules"],
};

/** The parts of the design the model needs to see, without bulky skill bodies. */
function designView(d: AgentDesign) {
  return {
    summary: d.summary,
    model: d.model.selected,
    login: d.login?.selected ?? "",
    tools: d.tools.map(({ enabled, ...t }) => ({ ...t, enabled })),
    data_sources: d.data_sources,
    skills: (d.skills ?? []).map((s) => ({ name: s.name, description: s.description, enabled: s.enabled })),
    step_limit: d.step_limit,
    fallback: d.fallback,
    mcp_servers: (d.mcp_servers ?? []).map((m) => m.name),
  };
}

const byName = <T extends { name: string }>(list: T[], upserts: T[], removes: string[]) => {
  const drop = new Set(removes);
  const out = list.filter((x) => !drop.has(x.name));
  for (const u of upserts) {
    const i = out.findIndex((x) => x.name === u.name);
    if (i >= 0) out[i] = u;
    else out.push(u);
  }
  return out;
};

export async function chatEditDesign(args: {
  design: AgentDesign;
  spec: Record<string, any> | null;
  history: ChatTurn[];
  message: string;
  /** The built agent's code, when it exists: the AI may then edit tool bodies and instructions too. */
  logic?: FilledLogic | null;
}): Promise<{ design: AgentDesign; logic: FilledLogic | null; codeChanged: boolean; reply: string }> {
  const { design } = args;
  const c = await activeProvider().completeJson<any>({
    system:
      DESIGN_SYSTEM +
      `\n\nYou are now EDITING an existing design in a chat with its owner. Make only the changes they ask for (plus anything those changes require, ` +
      `e.g. a new tool's data source). Keep everything else exactly as it is. Things you can't change here (memory, MCP servers, hosting, document search) ` +
      `are done with the Edit links on the page: say so in the reply.` +
      (args.logic
        ? ` The agent is already BUILT and its code is below. For a change in how an existing tool behaves, edit its body (tool_bodies) or add instruction rules (prompt_rules). ` +
          `Keep every existing tool's name, inputs and side effect exactly as they are (changing them forces a full rewrite); only touch tools_upsert/tools_remove when the owner asks for a NEW capability or to drop one.`
        : ` The agent isn't built yet: leave tool_bodies and prompt_rules empty.`),
    effort: args.logic ? "high" : "medium",
    schema: CHANGES_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `JOB SPEC:\n${args.spec ? specToAgentText(args.spec) : "(none)"}\n\nCURRENT DESIGN (JSON):\n${JSON.stringify(designView(design))}\n\n` +
          (args.logic
            ? `INSTRUCTIONS:\n${args.logic.system_prompt}\n\nTOOL CODE:\n${args.logic.tools.map((t) => `### ${t.name}\n${t.python_body}`).join("\n\n").slice(0, 24000)}\n\n`
            : "") +
          (args.history.length ? `EARLIER IN THIS CHAT:\n${args.history.slice(-8).map((t) => `${t.role}: ${t.text}`).join("\n")}\n\n` : "") +
          `OWNER: ${args.message}`,
      },
    ],
  });

  const prevTools = new Map(design.tools.map((t) => [t.name, t]));
  const upserts: ToolContract[] = (c.tools_upsert ?? []).map((t: any) => ({ ...t, enabled: prevTools.get(t.name)?.enabled ?? true }));
  const next: AgentDesign = {
    ...design,
    summary: c.summary?.trim() || design.summary,
    tools: byName(design.tools, upserts, c.tools_remove ?? []),
    data_sources: byName(design.data_sources, c.data_sources_upsert ?? [], c.data_sources_remove ?? []),
    step_limit: c.step_limit > 0 ? Math.min(50, c.step_limit) : design.step_limit,
    fallback: c.fallback?.trim() || design.fallback,
  };
  if (MODEL_IDS.includes(c.model) && c.model !== design.model.selected) {
    next.model = { ...design.model, selected: c.model };
    next.model_endpoint = undefined;
    next.model_price = undefined;
  }
  if (design.login && LOGINS.includes(c.login)) next.login = { ...design.login, selected: c.login };
  // Per-tool limits for removed tools are dropped; new tools fall back to the defaults.
  if (next.tool_limits) next.tool_limits = Object.fromEntries(Object.entries(next.tool_limits).filter(([n]) => next.tools.some((t) => t.name === n)));

  let skills = (design.skills ?? []).filter((s) => !(c.skills_remove ?? []).includes(s.name));
  const tools = next.tools.filter((t) => t.enabled).map((t) => t.name);
  const written = await Promise.all(
    (c.skills_add ?? []).slice(0, 3).map((request: string) => writeSkill({ request, agentSummary: next.summary, tools }).catch(() => null)),
  );
  for (const s of written) {
    if (!s) continue;
    let n = s.name;
    for (let i = 2; skills.some((x) => x.name === n); i++) n = `${s.name}-${i}`;
    skills = [...skills, { ...s, name: skillSlug(n) }];
  }
  next.skills = skills;

  let logic = args.logic ?? null;
  let codeChanged = false;
  if (logic) {
    const bodies = new Map<string, string>((c.tool_bodies ?? []).map((t: any) => [t.name, t.python_body]));
    const rules = (c.prompt_rules ?? []).map((r: string) => r.trim()).filter(Boolean);
    codeChanged = bodies.size > 0;
    if (bodies.size || rules.length) {
      logic = {
        ...logic,
        system_prompt: rules.length ? `${logic.system_prompt}\n\nOwner's rules:\n${rules.map((r: string) => `- ${r}`).join("\n")}` : logic.system_prompt,
        tools: logic.tools.map((t) => (bodies.has(t.name) ? { ...t, python_body: bodies.get(t.name)! } : t)),
      };
    }
  }

  return { design: next, logic, codeChanged, reply: String(c.reply ?? "").trim() || "Done." };
}
