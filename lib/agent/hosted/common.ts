/**
 * What every hosted build (Claude, ChatGPT) shares: the agent's tools as a script it runs in the platform's
 * sandbox, the instructions that tell it how, the keys it needs, the hosts those keys may be sent to, the
 * model-written logic, and where builds are kept (Development's phase state, under `hosted`).
 */

import { getPhaseState, savePhaseState } from "../../store";
import { loadBuild, toolsSignature } from "../build-context";
import type { AgentDesign } from "../design";
import type { FilledLogic } from "../types";
import type { PlatformBuild, PlatformId } from "../platforms";
import { indent, lit, ordered, PY_TYPE, pyIdent } from "../adapters/langchain";
import { generateLogic } from "../../phases/agent-engineering";
import { credentialsAdapter } from "../registry";
import { activeProvider } from "../../llm/registry";

type Hosted = Exclude<PlatformId, "self">;

interface EngState {
  hosted?: Partial<Record<Hosted, PlatformBuild>>;
  /** Model-written logic for hosted builds when there's no "our way" build to reuse (keyed by tool signature). */
  hostedLogic?: { signature: string; logic: FilledLogic };
  [k: string]: any;
}

export async function hostedBuilds(projectId: string): Promise<Partial<Record<Hosted, PlatformBuild>>> {
  return (await getPhaseState<EngState>(projectId, "engineering"))?.hosted ?? {};
}

export async function saveHostedBuild(projectId: string, b: PlatformBuild) {
  const s = (await getPhaseState<EngState>(projectId, "engineering")) ?? {};
  await savePhaseState(projectId, "engineering", { ...s, hosted: { ...(s.hosted ?? {}), [b.platform]: b } });
}

/** The tool code: reused from "our way" when it matches the design, else written once by the AI engine. */
export async function hostedLogic(projectId: string): Promise<FilledLogic> {
  const ctx = await loadBuild(projectId);
  if (!ctx.design || !ctx.spec) throw new Error("Approve the Agent Design first.");
  const sig = toolsSignature(ctx.design);
  if (ctx.build?.logic && ctx.build.tools_signature === sig) return ctx.build.logic;
  const s = (await getPhaseState<EngState>(projectId, "engineering")) ?? {};
  if (s.hostedLogic?.signature === sig) return s.hostedLogic.logic;
  const logic = await generateLogic(ctx.design, ctx.spec, ctx.title);
  const now = (await getPhaseState<EngState>(projectId, "engineering")) ?? {};
  await savePhaseState(projectId, "engineering", { ...now, hostedLogic: { signature: sig, logic } });
  return logic;
}

/** Where evaluations put a case's test data in the sandbox (tools.py answers from it when it's there). */
export const FIXTURES_PATH = "/workspace/eval_fixtures.json";

/** tools.py: every tool as a plain function, run as `python tools.py <tool> '<json args>'` (prints the result). */
export function toolsScript(design: AgentDesign, logic: FilledLogic): string {
  const tools = design.tools.filter((t) => t.enabled);
  const bodies = new Map(logic.tools.map((t) => [pyIdent(t.name), t.python_body]));
  const fns = tools.map((t) => {
    const fn = pyIdent(t.name);
    const args = ordered(t.inputs)
      .map((f) => (f.required ? `${pyIdent(f.name)}: ${PY_TYPE[f.type]}` : `${pyIdent(f.name)}: ${PY_TYPE[f.type]} | None = None`))
      .join(", ");
    const body = bodies.get(fn)?.trim() || `raise NotImplementedError(${lit(`${fn} has no implementation yet`)})`;
    return `def ${fn}(${args}) -> str:\n    """${t.description.replace(/"""/g, "'")}"""\n${indent(body)}`;
  });
  return `"""The agent's tools. Run one: python tools.py <tool_name> '<json arguments>'  (prints the result).
Keys come from environment variables; the platform fills them in when a request leaves the sandbox."""

from __future__ import annotations

import json
import os  # noqa: F401  (tool bodies read their keys from env)
import sys


${fns.join("\n\n\n")}


TOOLS = {${tools.map((t) => `${lit(pyIdent(t.name))}: ${pyIdent(t.name)}`).join(", ")}}
WRITES = {${tools.filter((t) => t.side_effect === "write").map((t) => lit(pyIdent(t.name))).join(", ")}}

# Test mode: when the pipeline's evaluations put test data here, tools answer from it and never touch real
# services (writes only say what they would do). Claude mounts uploaded files under /mnt/session/uploads.
FIXTURES = next((p for p in ("${FIXTURES_PATH}", "/mnt/session/uploads${FIXTURES_PATH}") if os.path.exists(p)), None)


def _test_answer(name: str, args: dict) -> str | None:
    if not FIXTURES:
        return None
    with open(FIXTURES, encoding="utf-8") as f:
        data = json.load(f)
    value = data.get(name)
    if isinstance(value, list):
        # Several answers: hand them out in order (the last one repeats).
        seen_file = "/tmp/eval_fixtures.count"
        seen = json.load(open(seen_file)) if os.path.exists(seen_file) else {}
        i = seen.get(name, 0)
        seen[name] = i + 1
        json.dump(seen, open(seen_file, "w"))
        value = value[min(i, len(value) - 1)] if value else None
    if value is not None:
        return value if isinstance(value, str) else json.dumps(value)
    if name in WRITES:
        return f"[dry run] would run {name}({json.dumps(args)}): approved for this test, carry on."
    return f"[test mode] no test data for {name}."


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in TOOLS:
        print("Usage: python tools.py <" + "|".join(TOOLS) + "> '<json arguments>'")
        sys.exit(2)
    try:
        args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
        test = _test_answer(sys.argv[1], args)
        print(test if test is not None else TOOLS[sys.argv[1]](**args))
    except Exception as e:  # noqa: BLE001 — the agent reads the error and decides what to do
        print(f"ERROR {type(e).__name__}: {e}")
        sys.exit(1)
`;
}

/** SKILL.md: when and how the agent uses its tools (each one, its arguments, and which ask first). */
export function skillDoc(design: AgentDesign, logic: FilledLogic, title: string, name: string): string {
  const tools = design.tools.filter((t) => t.enabled);
  const deps = logic.extra_dependencies ?? [];
  return `---
name: ${name}
description: The tools for "${title}" (${tools.map((t) => pyIdent(t.name)).join(", ")}). Use them for every task this agent does.
---

# Tools for ${title}

Run a tool with bash from this skill's folder:

    python tools.py <tool_name> '<json arguments>'

It prints the result (or a line starting with ERROR). ${deps.length ? `First time in a session, install what they need: \`pip install -q ${deps.join(" ")}\`.` : ""}

## The tools

${tools
  .map((t) => {
    const args = ordered(t.inputs).map((f) => `\`${pyIdent(f.name)}\` (${f.type}${f.required ? "" : ", optional"}): ${f.description}`);
    return `### ${pyIdent(t.name)}${t.requires_approval ? "  (ASK THE USER FIRST)" : ""}
${t.description}${t.output ? ` Returns: ${t.output}` : ""}
${args.length ? args.map((a) => `- ${a}`).join("\n") : "- no arguments"}`;
  })
  .join("\n\n")}

## Rules
- Tools marked ASK THE USER FIRST change things. Before running one, say exactly what it will do and wait for the user to say yes.
- Never print, log or repeat a key or token.
- If a tool keeps failing, stop and hand off: ${design.fallback || "tell the user what went wrong"}.
`;
}

/** The instructions: the model-written system prompt, plus how this platform's agent reaches its tools. */
export function hostedInstructions(design: AgentDesign, logic: FilledLogic, where: string): string {
  return `${logic.system_prompt.trim()}

HOW YOU WORK HERE: your tools are in ${where}. Read its SKILL.md once, then run tools from a shell as it says.
Tools marked ASK THE USER FIRST change things: describe what you'll do and wait for a yes before running them.
Stop after about ${design.step_limit} steps and hand off instead of guessing: ${design.fallback}`;
}

/** The keys the tools read, with their values (missing ones listed separately). */
export async function hostedKeys(projectId: string, design: AgentDesign): Promise<{ keys: Record<string, string>; missing: string[] }> {
  const env = await (await credentialsAdapter(projectId)).envFor(projectId);
  const names = [...new Set(design.tools.filter((t) => t.enabled && t.credential_env).map((t) => t.credential_env))];
  const keys: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) {
    const v = env[n] || process.env[n];
    if (v) keys[n] = v;
    else missing.push(n);
  }
  return { keys, missing };
}

/**
 * The web hosts the tools call (so the sandbox can reach only those, and each key is only ever sent there).
 * Asked of the small model from the tools' libraries; per key and in total.
 */
export async function hostedHosts(design: AgentDesign): Promise<{ all: string[]; byKey: Record<string, string[]> }> {
  const tools = design.tools.filter((t) => t.enabled);
  if (!tools.length) return { all: [], byKey: {} };
  const r = await activeProvider()
    .completeJson<{ keys: { key_env: string; hosts: string[] }[]; other_hosts: string[] }>({
      tier: "small",
      system: "List the exact API hostnames (no scheme, no path; wildcards like *.example.com allowed) that each tool's library calls.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          keys: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { key_env: { type: "string" }, hosts: { type: "array", items: { type: "string" } } },
              required: ["key_env", "hosts"],
            },
          },
          other_hosts: { type: "array", items: { type: "string" }, description: "Hosts tools without a key call (public sites they fetch)." },
        },
        required: ["keys", "other_hosts"],
      },
      messages: [
        {
          role: "user",
          content: tools.map((t) => `- ${t.name}: uses ${t.integration || "custom code"}; key ${t.credential_env || "(none)"}; ${t.description}`).join("\n"),
        },
      ],
    })
    .catch(() => ({ keys: [], other_hosts: [] }));
  const clean = (h: string) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const byKey: Record<string, string[]> = {};
  for (const k of r.keys ?? []) byKey[k.key_env] = [...new Set((k.hosts ?? []).map(clean).filter(Boolean))];
  const all = [...new Set([...Object.values(byKey).flat(), ...(r.other_hosts ?? []).map(clean)].filter(Boolean))];
  return { all, byKey };
}

/** Grade one answer against what the example task expects (small model; pass/fail + why). */
export async function gradeAnswer(task: string, expected: string, output: string): Promise<{ ok: boolean; reason: string }> {
  if (!output.trim()) return { ok: false, reason: "The agent gave no answer." };
  return activeProvider()
    .completeJson<{ ok: boolean; reason: string }>({
      tier: "small",
      system: "Grade one run of an AI agent. Pass it when the answer does what EXPECTED describes (wording can differ). Be strict but fair.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { ok: { type: "boolean" }, reason: { type: "string", description: "One sentence." } },
        required: ["ok", "reason"],
      },
      messages: [{ role: "user", content: `TASK: ${task}\nEXPECTED: ${expected}\nANSWER: ${output.slice(0, 6000)}` }],
    })
    .catch((e: any) => ({ ok: false, reason: `Couldn't grade: ${e?.message ?? "error"}` }));
}
