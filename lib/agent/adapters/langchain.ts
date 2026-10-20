/**
 * Framework slot — default adapter: LangChain `create_agent` (Python).
 *
 * Renders a deterministic skeleton from the approved agent-design; the only
 * model-written parts are the system prompt and each tool's body (FilledLogic).
 * Everything safety-related (step limit, retries, approvals, dry run, fallback,
 * tracing) is template code, so it can't be "forgotten" by a model.
 */

import type { FrameworkAdapter, GeneratedFile, FilledLogic, ExampleTask } from "../types";
import type { AgentDesign, Field, ToolContract } from "../design";
import { modelKeyEnv, modelPackage, effectiveLimits, effectiveMemory, stopRules } from "../design";
import { EVAL_RUNNER_PY, KNOWLEDGE_PY, MCP_PY, MEMORY_PY, RUN_PY, SAFETY_PY, SKILLS_PY } from "./langchain-runtime";
import { renderSkillMd, skillSlug } from "../skills";

export function pyIdent(name: string): string {
  const s = name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z_]/.test(s) ? s || "tool" : `t_${s}`;
}

function className(name: string): string {
  return pyIdent(name)
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

const PY_TYPE: Record<Field["type"], string> = {
  string: "str",
  number: "float",
  boolean: "bool",
  list: "list[str]",
  object: "dict",
};

const PY_SAMPLE: Record<Field["type"], string> = {
  string: '"test"',
  number: "1",
  boolean: "False",
  list: "[]",
  object: "{}",
};

/** A Python string literal (JSON escaping is valid Python for plain strings). */
function lit(s: string): string {
  return JSON.stringify(s ?? "");
}

function ordered(fields: Field[]): Field[] {
  return [...fields.filter((f) => f.required), ...fields.filter((f) => !f.required)];
}

function pydanticModel(name: string, fields: Field[], doc: string): string {
  const lines = [`class ${name}(BaseModel):`, `    """${doc.replace(/"""/g, "'")}"""`];
  if (fields.length === 0) lines.push("    pass");
  for (const f of ordered(fields)) {
    const t = PY_TYPE[f.type] ?? "str";
    lines.push(
      f.required
        ? `    ${pyIdent(f.name)}: ${t} = Field(description=${lit(f.description)})`
        : `    ${pyIdent(f.name)}: ${t} | None = Field(default=None, description=${lit(f.description)})`
    );
  }
  return lines.join("\n");
}

function indent(body: string, n = 4): string {
  const pad = " ".repeat(n);
  const text = body.replace(/\t/g, "    ").replace(/\s+$/, "");
  // Normalize the model's own indentation, then re-indent under the def.
  const lines = text.split("\n");
  const min = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => (l.trim() ? pad + l.slice(Number.isFinite(min) ? min : 0) : "")).join("\n");
}

function toolBlock(t: ToolContract, body: string): string {
  const fn = pyIdent(t.name);
  const args = ordered(t.inputs)
    .map((f) => (f.required ? `${pyIdent(f.name)}: ${PY_TYPE[f.type]}` : `${pyIdent(f.name)}: ${PY_TYPE[f.type]} | None = None`))
    .join(", ");
  const desc = `${t.description}${t.output ? ` Returns: ${t.output}` : ""}`;
  return [
    pydanticModel(`${className(t.name)}Args`, t.inputs, `Inputs for ${fn}.`),
    "",
    "",
    `@tool(${lit(fn)}, args_schema=${className(t.name)}Args, description=${lit(desc)})`,
    `@safe_tool(name=${lit(fn)}, side_effect=${lit(t.side_effect)})`,
    `def ${fn}(${args}) -> str:`,
    indent(body.trim() || `raise NotImplementedError(${lit(`${fn} has no implementation yet`)})`),
  ].join("\n");
}

function renderTools(design: AgentDesign, logic: FilledLogic): string {
  const tools = design.tools.filter((t) => t.enabled);
  const bodies = new Map(logic.tools.map((t) => [pyIdent(t.name), t.python_body]));
  const blocks = tools.map((t) => toolBlock(t, bodies.get(pyIdent(t.name)) ?? ""));
  const approval = tools.filter((t) => t.requires_approval).map((t) => lit(pyIdent(t.name)));
  return `"""The tools your agent can use. Generated from the approved Agent Design — edit the design, not this file."""

from __future__ import annotations

import os  # noqa: F401  (tool bodies read their credentials from env)

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from .safety import safe_tool


${blocks.join("\n\n\n")}


TOOLS = [${tools.map((t) => pyIdent(t.name)).join(", ")}]

# These pause for a human "approve / reject" before they run.
APPROVAL_REQUIRED = [${approval.join(", ")}]
`;
}

function renderFallback(design: AgentDesign): string {
  return `"""The safe fallback: when the agent can't finish, it hands the task to a human instead of guessing."""

from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from pathlib import Path

HUMAN = ${lit(design.fallback)}
_HERE = Path(__file__).resolve().parent.parent
# Hosted runtimes (e.g. AgentCore) run the code from a read-only folder: log to a writable one there.
LOG = Path(os.getenv("HANDOFF_LOG") or (_HERE / "handoffs.jsonl" if os.access(_HERE, os.W_OK) else Path(tempfile.gettempdir()) / "handoffs.jsonl"))
RETENTION_DAYS = ${design.retention_days && design.retention_days > 0 ? Math.round(design.retention_days) : 0}  # 0 = keep


def _prune() -> None:
    """Drop hand-off records older than RETENTION_DAYS."""
    if not RETENTION_DAYS or not LOG.exists():
        return
    cutoff = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - RETENTION_DAYS * 86400))
    keep = [l for l in LOG.read_text(encoding="utf-8").splitlines() if l and json.loads(l).get("at", "") >= cutoff]
    LOG.write_text("".join(k + "\\n" for k in keep), encoding="utf-8")


def hand_off(task: str, reason: str) -> dict:
    entry = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "task": task, "reason": reason, "to": HUMAN}
    # Logging a hand-off must never break the hand-off itself.
    try:
        _prune()
        with LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\\n")
    except OSError as e:
        logging.getLogger(__name__).warning("couldn't write the hand-off log: %s", e)
    return {"ok": False, "handed_off": True, "reason": reason, "to": HUMAN}
`;
}

function enabledSkills(design: AgentDesign) {
  return (design.skills ?? []).filter((s) => s.enabled && (!s.review || s.review.approved));
}

function ragOn(design: AgentDesign) {
  return design.knowledge?.mode === "rag";
}

/** Skill folders + the loader, and the document-search tool when RAG is the knowledge choice. */
function renderSkillsAndKnowledge(design: AgentDesign): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const skills = enabledSkills(design);
  for (const s of skills) {
    files.push({ path: `skills/${skillSlug(s.name)}/SKILL.md`, content: renderSkillMd(s), explains: `Skill: ${s.description}` });
  }
  if (skills.length) files.push({ path: "agent/skills.py", content: SKILLS_PY, explains: "Lists the skills in the agent's instructions and opens one only when a task needs it." });
  if (ragOn(design)) files.push({ path: "agent/knowledge.py", content: KNOWLEDGE_PY, explains: "Searches your documents and returns the closest passages with their source." });
  if ((design.mcp_servers ?? []).length) files.push({ path: "agent/mcp_tools.py", content: MCP_PY, explains: "Loads tools from your MCP servers, with the same limits and approvals as the agent's own tools." });
  return files;
}

function longTermMemory(design: AgentDesign, spec?: Record<string, any>) {
  const m = effectiveMemory(design, spec?.agent);
  return m.user_profile.enabled || m.past_conversations.enabled;
}

/** The approved design's limits, memory settings and stop rules, as plain Python data. */
function renderLimits(design: AgentDesign, spec?: Record<string, any>): string {
  // JSON is embedded and parsed, so text inside rules can never be mangled into Python literals.
  const py = (v: unknown) => `json.loads(r"""${JSON.stringify(v, null, 4)}""")`;
  return `"""Limits, memory and stop rules from the approved Agent Design. Change them in the design, not here."""

import json

# Per tool: most calls per run, retries after an error, seconds before a call is abandoned.
TOOL_LIMITS = ${py(effectiveLimits(design))}

MEMORY = ${py(effectiveMemory(design, spec?.agent))}

STOP_RULES = ${py(stopRules(spec, design))}

# MCP servers whose tools the agent loads at start (tokens come from env, never from here).
MCP_SERVERS = ${py(design.mcp_servers ?? [])}
`;
}

function renderGraph(design: AgentDesign, spec?: Record<string, any>): string {
  return `"""The agent itself: one tool-calling loop with a step limit, structured output and approvals."""

from __future__ import annotations

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware

from .limits import STOP_RULES
from .prompt import SYSTEM_PROMPT
from .schemas import AgentOutput
from .tools import APPROVAL_REQUIRED, TOOLS
${enabledSkills(design).length ? "from .skills import index_text, load_skill\n" : ""}${ragOn(design) ? "from .knowledge import search_knowledge\n" : ""}${longTermMemory(design, spec) ? "from .memory import remember\n" : ""}${(design.mcp_servers ?? []).length ? "from .mcp_tools import MCP_APPROVAL, MCP_TOOLS\n" : ""}
load_dotenv()

MODEL = ${lit(design.model.selected)}
# Most model + tool turns one run may take. Past this, the run stops and hands off.
STEP_LIMIT = ${Math.max(1, Math.round(design.step_limit) || 8)}


def _rules() -> str:
    return "\\n\\nWHEN TO STOP:\\n" + "\\n".join(f"- {r}" for r in STOP_RULES)


def build(checkpointer=None):
    middleware = []${design.model.selected.startsWith("anthropic:") ? `
    # Prompt caching: the instructions and tool list are the same on every step, so Anthropic bills them
    # at about a tenth of the price after the first call (cuts most of each run's input cost).
    try:
        from langchain_anthropic.middleware import AnthropicPromptCachingMiddleware

        middleware.append(AnthropicPromptCachingMiddleware(ttl="5m", unsupported_model_behavior="ignore"))
    except ImportError:  # older langchain-anthropic: run without caching
        pass` : ""}
    approve = [*APPROVAL_REQUIRED${(design.mcp_servers ?? []).length ? ", *MCP_APPROVAL" : ""}]
    if approve:
        middleware.append(HumanInTheLoopMiddleware(interrupt_on={name: True for name in approve}))
    return create_agent(
        model=MODEL,
        tools=[*TOOLS${(design.mcp_servers ?? []).length ? ", *MCP_TOOLS" : ""}${enabledSkills(design).length ? ", load_skill" : ""}${ragOn(design) ? ", search_knowledge" : ""}${effectiveMemory(design, spec?.agent).user_profile.enabled ? ", remember" : ""}],
        system_prompt=SYSTEM_PROMPT${enabledSkills(design).length ? " + index_text()" : ""} + _rules(),
        response_format=AgentOutput,
        middleware=middleware,
        checkpointer=checkpointer,
    )


# LangSmith Studio (\`uv run langgraph dev\`) loads this; it supplies its own persistence.
agent = build()
`;
}

function renderToolTests(design: AgentDesign): string {
  const tools = design.tools.filter((t) => t.enabled);
  const samples = tools
    .map((t) => {
      const args = ordered(t.inputs)
        .filter((f) => f.required)
        .map((f) => `${lit(pyIdent(f.name))}: ${PY_SAMPLE[f.type]}`)
        .join(", ");
      return `    ${lit(pyIdent(t.name))}: {${args}},`;
    })
    .join("\n");
  const writes = tools.filter((t) => t.side_effect === "write").map((t) => lit(pyIdent(t.name)));
  return `"""Deterministic checks — no model calls, no network."""

import pytest

from agent.tools import APPROVAL_REQUIRED, TOOLS

SAMPLE_ARGS = {
${samples}
}
WRITE_TOOLS = [${writes.join(", ")}]


def test_every_tool_has_a_schema():
    for t in TOOLS:
        assert t.name and t.description
        assert t.args_schema is not None


def test_approval_tools_exist():
    names = {t.name for t in TOOLS}
    assert set(APPROVAL_REQUIRED) <= names


@pytest.mark.parametrize("name", WRITE_TOOLS)
def test_write_tools_do_nothing_in_dry_run(name, monkeypatch):
    monkeypatch.setenv("AGENT_DRY_RUN", "1")
    tool = next(t for t in TOOLS if t.name == name)
    assert tool.invoke(SAMPLE_ARGS[name]).startswith("[dry run]")
`;
}

function renderExampleTests(design: AgentDesign): string {
  return `"""Runs the example tasks from Define the Job through the real agent (dry run: writes never execute).

Each result is graded by the model against the expected outcome and saved to .results/examples.json.
"""

import json
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

# The agent is imported inside the test so a missing model key skips instead of failing collection.

EXAMPLES = json.loads((Path(__file__).parent / "examples.json").read_text())
RESULTS = Path(__file__).resolve().parent.parent / ".results" / "examples.json"
KEY = ${lit(modelKeyEnv(design.model.selected))}


class Verdict(BaseModel):
    passed: bool
    reason: str


def grade(task: str, expected: str, actual) -> tuple[Verdict, dict]:
    """The grade, and the grading tokens it cost (so the pipeline can count testing spend)."""
    from langchain.chat_models import init_chat_model

    from agent.graph import MODEL

    judge = init_chat_model(os.getenv("EVAL_JUDGE_MODEL", MODEL)).with_structured_output(Verdict, include_raw=True)
    out = judge.invoke(
        "Grade an AI agent's run. Pass only if the actual result achieves what the expected outcome describes "
        "(wording can differ). Write tools ran in dry-run mode, so '[dry run] would ...' counts as doing it, and "
        "read tools returned test data. This is a test run with no one to click approve: every approval step counts "
        "as shown and approved, so actions after it are not 'before approval'.\\n\\n"
        f"TASK:\\n{task}\\n\\nEXPECTED:\\n{expected}\\n\\nACTUAL:\\n{json.dumps(actual, default=str)[:6000]}"
    )
    u = getattr(out["raw"], "usage_metadata", None) or {}
    usage = {"input_tokens": int(u.get("input_tokens") or 0), "output_tokens": int(u.get("output_tokens") or 0)}
    if out["parsed"] is None:
        return Verdict(passed=False, reason=f"judge failed: {out.get('parsing_error')}"), usage
    return out["parsed"], usage


@pytest.fixture(scope="session", autouse=True)
def _results_file():
    RESULTS.parent.mkdir(exist_ok=True)
    RESULTS.write_text("[]")
    yield


@pytest.mark.skipif(not os.getenv(KEY), reason=f"{KEY} not set")
@pytest.mark.parametrize("i", range(len(EXAMPLES)))
def test_example_task(i, monkeypatch):
    from agent.run import run_task

    monkeypatch.setenv("AGENT_DRY_RUN", "1")
    ex = EXAMPLES[i]
    monkeypatch.setenv("AGENT_FIXTURES", json.dumps(ex.get("fixtures", {})))
    result = run_task(ex.get("run_input") or ex["input"])
    verdict, judge_usage = grade(ex["input"], ex["expected"], result) if result.get("ok") else (Verdict(passed=False, reason=f"Handed off: {result.get('reason')}"), {})
    rows = json.loads(RESULTS.read_text())
    rows.append({"index": i, "input": ex["input"], "expected": ex["expected"], "result": result, "passed": verdict.passed, "reason": verdict.reason,
                 "judge_usage": judge_usage})
    RESULTS.write_text(json.dumps(rows, indent=2, default=str))
    assert verdict.passed, verdict.reason
`;
}

function renderPyproject(title: string, design: AgentDesign, logic: FilledLogic, slug: string): string {
  const provider = modelPackage(design.model.selected);
  const deps = [
    "langchain>=1.0",
    "langgraph>=1.0",
    provider,
    "langsmith>=0.4",
    "pydantic>=2.7",
    "python-dotenv>=1.0",
    "langfuse>=3.8",
    "starlette>=0.40",
    "uvicorn>=0.30",
    "psycopg[binary]>=3.2",
    "psycopg-pool>=3.2",
    "langgraph-checkpoint-postgres>=2.0",
    "pyjwt[crypto]>=2.9",
    "bedrock-agentcore>=0.1",
    ...((design.mcp_servers ?? []).length ? ["langchain-mcp-adapters>=0.1"] : []),
    ...logic.extra_dependencies.filter((d) => /^[A-Za-z0-9_.\-\[\]]+([<>=!~]=?[A-Za-z0-9_.*]+)?$/.test(d)),
  ];
  return `[project]
name = ${lit(slug)}
version = "0.1.0"
description = ${lit(`${title} — generated by the Rapid Vibe Coding agent pipeline`)}
requires-python = ">=3.11"
dependencies = [
${[...new Set(deps)].map((d) => `    ${lit(d)},`).join("\n")}
]

[dependency-groups]
dev = ["pytest>=8", "langgraph-cli[inmem]>=0.4", "boto3>=1.35", "pyyaml>=6", "bedrock-agentcore-starter-toolkit>=0.1"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
`;
}

function renderEnvExample(design: AgentDesign): string {
  const lines = [
    "# Copy to .env (the pipeline writes .env for you from the keys you pasted in Agent Design).",
    ...(modelKeyEnv(design.model.selected) ? [`${modelKeyEnv(design.model.selected)}=`] : []),
    ...(design.model_endpoint ? [`OPENAI_BASE_URL=${design.model_endpoint}`] : []),
    "",
    "# Tracing to LangSmith (free tier is enough while building).",
    "LANGSMITH_TRACING=true",
    "LANGSMITH_API_KEY=",
    "",
    "# Tool credentials",
  ];
  for (const t of design.tools.filter((t) => t.enabled && t.credential_env)) lines.push(`${t.credential_env}=  # ${t.credential_label}`);
  return lines.join("\n") + "\n";
}

function renderReadme(title: string, design: AgentDesign): string {
  const tools = design.tools.filter((t) => t.enabled);
  return `# ${title}

${design.summary}

## What's in here

| Part | What it does |
|---|---|
| \`agent/graph.py\` | The agent: model (${design.model.selected}), tools, step limit (${design.step_limit}), approvals |
| \`agent/prompt.py\` | The instructions the agent follows |
| \`agent/tools.py\` | The ${tools.length} tool(s) it can use: ${tools.map((t) => t.name).join(", ") || "none"} |
| \`agent/schemas.py\` | The shape of its answer |
| \`agent/safety.py\` | Retries, error handling, dry run for writes |
| \`agent/fallback.py\` | Hands the task to a human when it can't finish |
| \`tests/\` | Tool checks + the example tasks from Define the Job |

## Run it

\`\`\`bash
uv sync
uv run python -m agent.run "your task"
uv run pytest
uv run langgraph dev   # inspect runs in LangSmith Studio
\`\`\`

Generated from the approved Agent Design. To change behavior, change the design and rebuild.
`;
}

export const langchainFramework: FrameworkAdapter = {
  id: "langchain",
  slot: "framework",
  label: "LangChain",
  blurb: "create_agent: one tool-calling loop with structured output, a step limit, and approval middleware.",
  status: "active",
  language: "python",
  isConnected: async () => true,
  render({ title, design, logic, exampleTasks, spec }): GeneratedFile[] {
    const slug = pyIdent(title).replace(/_/g, "-") || "agent";
    const base: ExampleTask[] = exampleTasks.length ? exampleTasks : [{ input: "Hello", expected: "A sensible reply" }];
    const toolNames = new Set(design.tools.filter((t) => t.enabled).map((t) => pyIdent(t.name)));
    const examples = base.map((ex, i) => {
      const filled = logic.examples.find((e) => e.index === i);
      // Several answers for one tool = one per call, in order.
      const fixtures: Record<string, string | string[]> = {};
      for (const f of (filled?.fixtures ?? []).filter((f) => toolNames.has(pyIdent(f.tool)))) {
        const k = pyIdent(f.tool);
        const prev = fixtures[k];
        fixtures[k] = prev === undefined ? f.response : [...(Array.isArray(prev) ? prev : [prev]), f.response];
      }
      return { ...ex, run_input: filled?.run_input || ex.input, fixtures };
    });
    const workflowNote =
      design.approach.selected === "workflow"
        ? "\n\nThis job has fixed steps. Follow them in order every time; do not improvise extra steps."
        : "";
    return [
      { path: "agent/__init__.py", content: "", explains: "Marks the agent folder as a Python package." },
      { path: "agent/limits.py", content: renderLimits(design, spec), explains: "Your limits per tool, memory settings and when-to-stop rules, from the approved design." },
      { path: "agent/memory.py", content: MEMORY_PY, explains: "What the agent remembers about each user across conversations (only what you turned on)." },
      { path: "agent/graph.py", content: renderGraph(design, spec), explains: "The agent itself: which model it uses, its tools, the step limit and which actions need your approval." },
      {
        path: "agent/prompt.py",
        content: `"""The instructions the agent follows."""\n\nSYSTEM_PROMPT = ${lit(logic.system_prompt + workflowNote)}\n`,
        explains: "The instructions the agent follows on every run.",
      },
      {
        path: "agent/schemas.py",
        content: `"""The shape of the agent's input and answer."""\n\nfrom __future__ import annotations\n\nfrom pydantic import BaseModel, Field\n\n\n${pydanticModel("AgentInput", design.inputs, "What the agent is given.")}\n\n\n${pydanticModel("AgentOutput", design.outputs, "What the agent hands back.")}\n`,
        explains: "The exact shape of what goes in and what comes back, so answers are always structured.",
      },
      { path: "agent/tools.py", content: renderTools(design, logic), explains: "Each tool the agent can use, with its inputs. Write tools pause for approval where you asked for it." },
      { path: "agent/safety.py", content: SAFETY_PY, explains: "Guardrails on every tool: retries, error handling, and a dry-run mode so tests never take real actions." },
      { path: "agent/fallback.py", content: renderFallback(design), explains: "When the agent can't finish, it hands the task to a person instead of guessing." },
      { path: "agent/run.py", content: RUN_PY, explains: "Runs one task from the command line and asks you to approve flagged actions." },
      { path: "evals/__init__.py", content: "", explains: "Marks the evals folder." },
      {
        path: "evals/run_evals.py",
        content: EVAL_RUNNER_PY,
        explains: "The evaluation runner: tries every test case several times and scores the outcome, the tools used, and safety.",
      },
      { path: "tests/__init__.py", content: "", explains: "Marks the tests folder." },
      { path: "tests/examples.json", content: JSON.stringify(examples, null, 2) + "\n", explains: "The example tasks from Define the Job: what the agent receives, test data for its tools, and what a correct answer looks like." },
      { path: "tests/test_tools.py", content: renderToolTests(design), explains: "Fast checks that every tool is wired correctly and write tools do nothing in dry run." },
      { path: "tests/test_examples.py", content: renderExampleTests(design), explains: "Runs each example task through the real agent and grades the result." },
      { path: "pyproject.toml", content: renderPyproject(title, design, logic, slug), explains: "The packages the agent needs." },
      { path: ".python-version", content: "3.12\n", explains: "The Python version the agent runs on." },
      {
        path: "langgraph.json",
        content: JSON.stringify({ dependencies: ["."], graphs: { agent: "./agent/graph.py:agent" }, env: ".env" }, null, 2) + "\n",
        explains: "Lets LangSmith Studio open the agent so you can inspect its runs.",
      },
      { path: ".env.example", content: renderEnvExample(design), explains: "The keys the agent needs (the real values live in .env, which is never committed)." },
      { path: ".gitignore", content: ".env\n.venv/\n__pycache__/\n.results/\nhandoffs.jsonl\n.langgraph_api/\n.bedrock_agentcore/\n", explains: "Keeps secrets, local files and AWS build bundles out of git." },
      { path: "README.md", content: renderReadme(title, design), explains: "A plain-language tour of the codebase." },
      ...renderSkillsAndKnowledge(design),
    ];
  },
};
