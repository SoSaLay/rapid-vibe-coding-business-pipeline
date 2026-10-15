/**
 * Agent pipeline — stage 3: Engineering & Development.
 *
 * Fully automatic: builds exactly the APPROVED agent-design, no new decisions.
 *   1. write   — the model fills the parts a template can't know (system prompt,
 *                tool bodies); the framework adapter renders everything else
 *   2. install — the unit-test adapter sets up the Python env (uv)
 *   3. test    — runs tool checks + the stage 1 example tasks (dry run)
 * Output: the codebase in the agent's workspace folder + a build-manifest.
 */

import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { activeProvider } from "../llm/registry";
import type { AgentDesign } from "../agent/design";
import type { ExampleTask, FilledLogic, GeneratedFile } from "../agent/types";
import { pyIdent } from "../agent/adapters/langchain";
import { specToAgentText } from "./agent-design";

const exec = promisify(execFile);

const LOGIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    system_prompt: {
      type: "string",
      description:
        "The agent's system prompt: its job, how to use each tool, its boundaries (forbidden actions), when to stop and hand off, and the exact answer format. Plain, direct, second person.",
    },
    tools: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "The tool's name exactly as given." },
          python_body: {
            type: "string",
            description:
              "ONLY the body of the Python function (no def line, no decorators). The arguments are already local variables. Import libraries INSIDE the body. Read credentials with os.environ[\"ENV_NAME\"]. Must return a str.",
          },
        },
        required: ["name", "python_body"],
      },
    },
    extra_dependencies: {
      type: "array",
      items: { type: "string", description: "A pip requirement the tool bodies import, e.g. 'google-api-python-client>=2.0'." },
    },
    examples: {
      type: "array",
      description: "One entry per example task (by index): how it is actually handed to the agent, plus test data for the tools it will call.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          run_input: {
            type: "string",
            description: "The message the agent receives for this example, in the agent's REAL input shape (e.g. 'New email id=test-1 arrived.' when it fetches by id).",
          },
          fixtures: {
            type: "array",
            description: "Realistic canned responses for each READ tool this run will call, consistent with the example (e.g. fetch_email returns that email's sender, subject and body). Write tools may be omitted.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { tool: { type: "string" }, response: { type: "string" } },
              required: ["tool", "response"],
            },
          },
        },
        required: ["index", "run_input", "fixtures"],
      },
    },
  },
  required: ["system_prompt", "tools", "extra_dependencies", "examples"],
};

function toolSpecText(design: AgentDesign): string {
  return design.tools
    .filter((t) => t.enabled)
    .map((t) => {
      const args = t.inputs.map((f) => `${pyIdent(f.name)}: ${f.type}${f.required ? "" : " (optional, may be None)"} — ${f.description}`).join("; ");
      return [
        `- ${pyIdent(t.name)} (${t.side_effect}${t.requires_approval ? ", needs human approval" : ""})`,
        `  does: ${t.description}`,
        `  uses: ${t.kind === "integration" ? t.integration : "custom code"}`,
        `  permission: ${t.permission}`,
        `  credential env: ${t.credential_env || "(none)"}`,
        `  args: ${args || "(none)"}`,
        `  returns: ${t.output}`,
      ].join("\n");
    })
    .join("\n");
}

/** The only model-written code. Everything safety-related stays in the template. */
export async function generateLogic(design: AgentDesign, spec: Record<string, any>, title: string, fixHint = ""): Promise<FilledLogic> {
  const result = await activeProvider().completeJson<FilledLogic>({
    system:
      "You are a senior Python engineer writing production LangChain agent code from an APPROVED design. Implement the design exactly; " +
      "add no tools and change no permissions. Tool bodies must be real working code against the named library or API — never a stub, " +
      "TODO or fake data. If a credential is missing at run time, raise KeyError naming it. Keep each body short and use the narrowest " +
      "API scope named in the design. Retries, dry-run, approvals and error handling are already handled by a wrapper — do not add them.",
    effort: "high",
    schema: LOGIC_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `AGENT: ${title}\n\nJOB:\n${specToAgentText(spec)}\n\nDESIGN SUMMARY: ${design.summary}\n` +
          `Approach: ${design.approach.selected}. Model: ${design.model.selected}. Memory: ${design.memory.selected}. Step limit: ${design.step_limit}.\n` +
          `Human fallback: ${design.fallback}\n` +
          `Answer fields: ${design.outputs.map((f) => `${f.name} (${f.type}): ${f.description}`).join("; ")}\n\n` +
          `TOOLS:\n${toolSpecText(design) || "(none)"}\n\n` +
          `EXAMPLE TASKS (for the test run):\n${exampleTasks(spec).map((e, i) => `  [${i}] ${e.input} → expected: ${e.expected}`).join("\n") || "(none)"}\n\n` +
          (fixHint ? `THE PREVIOUS ATTEMPT FAILED. Fix this:\n${fixHint.slice(-4000)}\n\n` : "") +
          "Write the system prompt, every tool body, and the test setup for each example task.",
      },
    ],
  });
  return {
    system_prompt: result.system_prompt || "",
    tools: result.tools || [],
    extra_dependencies: (result.extra_dependencies || []).filter((d) => typeof d === "string"),
    examples: Array.isArray(result.examples) ? result.examples : [],
  };
}

/** Every env var the tool bodies read — tools can need more than the one credential the design names. */
export function envVarsUsed(logic: FilledLogic): string[] {
  const found = new Set<string>();
  const re = /os\.(?:environ\[\s*|environ\.get\(\s*|getenv\(\s*)["']([A-Z][A-Z0-9_]*)["']/g;
  for (const t of logic.tools) for (const m of t.python_body.matchAll(re)) found.add(m[1]);
  return [...found];
}

export function exampleTasks(spec: Record<string, any>): ExampleTask[] {
  const raw = spec?.agent?.example_tasks;
  return Array.isArray(raw) ? raw.filter((e: any) => e?.input && e?.expected) : [];
}

/** Write the files into the workspace and commit them. Leaves .env / .venv / results alone. */
export async function writeCodebase(dir: string, files: GeneratedFile[], message: string): Promise<boolean> {
  for (const f of files) {
    const full = path.join(dir, f.path);
    if (!full.startsWith(dir + path.sep)) continue;
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, f.content, "utf8");
  }
  try {
    await fs.access(path.join(dir, ".git")).catch(() => exec("git", ["init"], { cwd: dir }));
    await exec("git", ["add", "-A"], { cwd: dir });
    await exec("git", ["commit", "-m", message, "--allow-empty"], { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

export interface ExampleResult {
  index: number;
  input: string;
  expected: string;
  passed: boolean;
  reason: string;
}

export async function readExampleResults(dir: string): Promise<ExampleResult[]> {
  try {
    const rows = JSON.parse(await fs.readFile(path.join(dir, ".results", "examples.json"), "utf8"));
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      index: r.index,
      input: r.input,
      expected: r.expected,
      passed: !!r.passed,
      reason: String(r.reason ?? ""),
    }));
  } catch {
    return [];
  }
}

/** Is `rel` one of the files this build generated? Guards the read-a-file route. */
export function isGeneratedFile(files: { path: string }[], rel: string): boolean {
  return files.some((f) => f.path === rel);
}
