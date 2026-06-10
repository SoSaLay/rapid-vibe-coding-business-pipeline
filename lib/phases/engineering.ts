/**
 * Phase 6 — Development & Engineering (Part A).
 *
 * The architect/foreman, not the builder. Consumes product-spec + design-spec
 * (design optional) and produces:
 *  1. a stack proposal (9 slots, studio defaults, warned deviations) + Mermaid
 *     architecture diagram → `stack-selection`
 *  2. a milestone/task graph with per-task acceptance criteria → `task-graph`
 *  3. the briefing package rendered into the app's own workspace folder, which
 *     the user's coding agent (Claude Code; GSD-compatible) executes
 *  4. on completion, a build-manifest + Launch Guide → gates QA.
 */

import { activeProvider } from "../llm/registry";
import { ideaTypeContext } from "../idea-types";
import { STACK_SLOTS, StackChoice, getSlot, normalizeChoices, stackToText } from "../stack";

/* ---------------- Stage 1: stack proposal ---------------- */

const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    choices: {
      type: "array",
      description: "One entry per slot. Use the studio default unless THIS product genuinely demands a deviation.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          slot: { type: "string" },
          choice: { type: "string", description: "An option id from that slot." },
          rationale: { type: "string", description: "One line. For deviations: why the default fails this product." },
        },
        required: ["slot", "choice", "rationale"],
      },
    },
    architecture_summary: { type: "string", description: "3-5 sentences: how the pieces fit, in plain language." },
    mermaid_diagram: {
      type: "string",
      description: "A Mermaid `graph TD` of the system: user → frontend → backend → db/auth/payments/external services. Valid Mermaid only.",
    },
    key_decisions: {
      type: "array",
      items: { type: "string" },
      description: "Notable calls a developer should know (data model shape, where AI is used, what's deferred).",
    },
  },
  required: ["choices", "architecture_summary", "mermaid_diagram", "key_decisions"],
};

export interface StackProposal {
  choices: StackChoice[];
  architecture_summary: string;
  mermaid_diagram: string;
  key_decisions: string[];
}

function slotMenu(): string {
  return STACK_SLOTS.map((s) => {
    const opts = s.options
      .filter((o) => o.status !== "coming_soon")
      .map((o) => `    - ${o.id}: ${o.label}. ${o.note}${o.warning ? ` WARNING: ${o.warning}` : ""}`)
      .join("\n");
    return `- slot "${s.id}" (${s.label}) — DEFAULT: ${s.default}\n${opts}`;
  }).join("\n");
}

function specToText(spec: Record<string, any>): string {
  const f = (arr: any[]) => (Array.isArray(arr) ? arr.join("; ") : "");
  return [
    `Summary: ${spec.summary || ""}`,
    `Problem: ${spec.problem_statement || ""}`,
    `Target users: ${f(spec.target_users)}`,
    `Must-have features: ${(spec.must_have_features || []).map((x: any) => `${x.name}: ${x.description || ""}`).join("; ")}`,
    ideaTypeContext(spec.idea_type),
  ].join("\n");
}

function designToText(design: Record<string, any> | null): string {
  if (!design) return "(no design-spec — Product Design was skipped; the agent will follow sensible defaults)";
  const screens = (design.ux?.screens || []).map((s: any) => s.name).join(", ");
  return [
    `Brand: ${design.branding?.name || ""} — ${design.branding?.tagline || ""}`,
    `Screens: ${screens}`,
    `Components: ${(design.components || []).map((c: any) => c.name).join(", ")}`,
    `Style: ${design.visual?.style || ""} (${design.visual?.mode || ""})`,
  ].join("\n");
}

export async function generateStackProposal(
  spec: Record<string, any>,
  design: Record<string, any> | null,
  productTitle: string
): Promise<StackProposal> {
  const provider = activeProvider();
  const result = await provider.completeJson<StackProposal>({
    system:
      "You are a pragmatic system-design architect for solo-founder MVPs built by AI coding agents. " +
      "Bias hard toward the studio defaults — they are chosen for simplicity and agent-friendliness. " +
      "Deviate ONLY when this specific product's requirements make the default genuinely wrong, and say why. " +
      "Slots and allowed options:\n\n" +
      slotMenu(),
    effort: "medium",
    schema: PROPOSAL_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `PRODUCT: ${productTitle}\n\nSPEC:\n${specToText(spec)}\n\nDESIGN:\n${designToText(design)}\n\n` +
          "Propose the stack (one choice per slot), the architecture summary, the Mermaid diagram, and key decisions.",
      },
    ],
  });
  return { ...result, choices: normalizeChoices(result.choices || []) };
}

/* ---------------- Stage 2: task graph ---------------- */

const TASK_GRAPH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    milestones: {
      type: "array",
      description: "4-7 milestones in build order. Milestone 1 is always scaffold/setup; the final one is verification + Launch Guide.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "M1, M2, …" },
          name: { type: "string" },
          goal: { type: "string", description: "What is demonstrably true when this milestone is done." },
          tasks: {
            type: "array",
            description: "Small tasks — each completable in one focused agent session.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", description: "T1.1, T1.2, …" },
                title: { type: "string", description: "Imperative, specific." },
                details: { type: "string", description: "What to build and any constraints. Reference SPECS/ files where relevant." },
                acceptance_criteria: {
                  type: "array",
                  items: { type: "string" },
                  description: "Verifiable checks — commands that pass, behaviors observable in the browser.",
                },
              },
              required: ["id", "title", "details", "acceptance_criteria"],
            },
          },
        },
        required: ["id", "name", "goal", "tasks"],
      },
    },
  },
  required: ["milestones"],
};

export interface TaskGraph {
  milestones: {
    id: string;
    name: string;
    goal: string;
    tasks: { id: string; title: string; details: string; acceptance_criteria: string[] }[];
  }[];
}

export async function generateTaskGraph(
  spec: Record<string, any>,
  design: Record<string, any> | null,
  choices: StackChoice[],
  productTitle: string
): Promise<TaskGraph> {
  const provider = activeProvider();
  const screens = design?.ux?.screens
    ? (design.ux.screens as any[])
        .map(
          (s) =>
            `- ${s.name}: ${s.purpose} (primary action: ${s.primary_action}; states: empty/loading/error/success per design-spec)`
        )
        .join("\n")
    : "(no design-spec — derive screens from the product spec)";

  return provider.completeJson<TaskGraph>({
    system:
      "You are a tech lead breaking an MVP into a task graph an AI coding agent (Claude Code) will execute one task " +
      "per fresh session. Rules:\n" +
      "- Milestone 1 = scaffold: create-next-app (or chosen frontend), Tailwind + shadcn/ui init, repo hygiene, env template, DB/auth client setup.\n" +
      "- Tasks must be SMALL and independently verifiable. Acceptance criteria are commands or observable behaviors, never vibes.\n" +
      "- Include test setup early (Vitest) and at least smoke tests for core flows (Playwright optional).\n" +
      "- Every screen task must implement the screen's empty/loading/error/success states from the design spec.\n" +
      "- Security is built in, not bolted on: tasks that create API routes/forms include input-validation acceptance criteria; " +
      "tasks that create database tables include an RLS-policy criterion; tasks behind auth include a 'rejects unauthenticated requests' criterion.\n" +
      "- Final milestone: full verification pass (typecheck, tests, build, npm audit) + write LAUNCH-GUIDE.md per the template in CLAUDE.md.\n" +
      "- Stay strictly inside the chosen stack. Do not invent services that aren't in it.",
    effort: "high",
    schema: TASK_GRAPH_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `PRODUCT: ${productTitle}\n\nSPEC:\n${specToText(spec)}\n\nCHOSEN STACK:\n${stackToText(choices)}\n\n` +
          `SCREENS TO BUILD:\n${screens}\n\nProduce the milestone/task graph.`,
      },
    ],
  });
}

/* ---------------- Briefing renderers (deterministic) ---------------- */

export function renderTasksMd(graph: TaskGraph, productTitle: string): string {
  const lines: string[] = [
    `# TASKS — ${productTitle}`,
    "",
    "> The build tracker. The coding agent works top-to-bottom: pick the first unchecked task,",
    "> implement it, verify every acceptance criterion, tick the box `[x]`, commit, then move on.",
    "> NEVER tick a box whose criteria don't pass. The pipeline dashboard reads this file.",
    "",
  ];
  for (const m of graph.milestones) {
    lines.push(`## ${m.id} — ${m.name}`, "", `Goal: ${m.goal}`, "");
    for (const t of m.tasks) {
      lines.push(`- [ ] **${t.id}** ${t.title}`);
      lines.push(`  - ${t.details}`);
      for (const ac of t.acceptance_criteria) lines.push(`  - ✓ ${ac}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderClaudeMd(args: {
  productTitle: string;
  choices: StackChoice[];
  proposal: StackProposal;
  design: Record<string, any> | null;
}): string {
  const { productTitle, choices, proposal, design } = args;
  const tokens = design?.visual
    ? [
        "## Design tokens (obey EXACTLY — from the approved design-spec)",
        "",
        "Colors:",
        ...(design.visual.colors || []).map((c: any) => `- ${c.name}: ${c.hex} — ${c.usage}`),
        "",
        `Typography: headings ${design.visual.typography?.heading_font}, body ${design.visual.typography?.body_font}, scale ${design.visual.typography?.type_scale}`,
        `Spacing/shape: ${design.visual.spacing_and_shape?.spacing_scale} · radius ${design.visual.spacing_and_shape?.radius} · ${design.visual.spacing_and_shape?.elevation}`,
        `Style: ${design.visual.style} · ${design.visual.mode} mode · mood: ${design.visual.mood}`,
        "",
        "Wire these into tailwind.config / CSS variables in the scaffold milestone, then never hard-code values.",
      ].join("\n")
    : "## Design tokens\n\n(no design-spec — use clean shadcn defaults, dark mode, one accent color)";

  const dosDonts = design?.dos_and_donts
    ? [
        "## Design do's & don'ts (verbatim from the design-spec — follow on every UI task)",
        "",
        ...(design.dos_and_donts.dos || []).map((d: string) => `- DO: ${d}`),
        ...(design.dos_and_donts.donts || []).map((d: string) => `- DON'T: ${d}`),
      ].join("\n")
    : "";

  return `# ${productTitle} — build briefing

This app is built by an AI coding agent from this briefing. Source of truth:
- \`SPECS/product-spec.json\` — what to build and why
- \`SPECS/design-spec.json\` — screens, states, tokens (when present)
- \`TASKS.md\` — the ordered build tracker (work it top-to-bottom)

## Stack (decided — do not deviate)

${stackToText(choices)}

${proposal.architecture_summary}

Key decisions:
${proposal.key_decisions.map((k) => `- ${k}`).join("\n")}

## Execution discipline

1. Open \`TASKS.md\`, take the FIRST unchecked task. One task per session — run \`/clear\` between tasks to keep context fresh.
2. Implement it. Stay inside the task's scope; if you discover needed work, add a new unchecked task instead of expanding this one.
3. Verify EVERY acceptance criterion. \`npx tsc --noEmit\` (and tests, once they exist) must pass before any task is done.
4. Tick the checkbox \`[x]\`, commit with message \`<task-id>: <title>\`, then stop or take the next task.
5. Secrets live in \`.env.local\` only (gitignored). Never commit keys. Add every new env var to \`.env.example\` with a comment.
6. Screens must implement their empty/loading/error/success states as written in the design-spec. No lorem ipsum anywhere.

GSD users: \`/gsd:import --from TASKS.md\` works; keep TASKS.md checkboxes in sync — the pipeline dashboard reads them.

## Security defaults (non-negotiable — apply on every task, verified again in QA)

- Validate ALL external input (API route bodies, query params, form data) with zod schemas at the boundary. Reject, don't sanitize-and-hope.
- Every Supabase table gets a row-level-security policy IN THE SAME TASK that creates it. No table ships with RLS off.
- Auth checks happen SERVER-SIDE on every protected route/action — client-side redirects are UX, not security.
- The service-role key never appears in client code or NEXT_PUBLIC_ env vars. Client uses the anon key only.
- No \`dangerouslySetInnerHTML\` with user-influenced content; escape anything user-provided that gets rendered.
- Public endpoints that write (signups, webhooks, contact forms) note rate-limiting needs in a comment if not implemented.
- Run \`npm audit\` during the final verification milestone; fix criticals.

${tokens}

${dosDonts}

## LAUNCH-GUIDE.md (final task template)

Write it for a non-developer: 1) every key/account to create and where to paste it (.env var names), 2) run locally (install → dev → URL), 3) what to click to verify each core flow, 4) the API routes that exist and what they do, 5) what Phase 8 deployment will need (host: ${getSlot("hosting")?.options.find((o) => o.id === choices.find((c) => c.slot === "hosting")?.choice)?.label || "see stack"}).
`;
}

/* ---------------- Progress parsing ---------------- */

export interface BuildProgress {
  total: number;
  done: number;
  current: string | null; // first unchecked task line
  milestones: { name: string; total: number; done: number }[];
}

export function parseTasksMd(content: string): BuildProgress {
  const milestones: BuildProgress["milestones"] = [];
  let total = 0;
  let done = 0;
  let current: string | null = null;
  let mi: { name: string; total: number; done: number } | null = null;

  for (const line of content.split("\n")) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      if (mi) milestones.push(mi);
      mi = { name: heading[1].trim(), total: 0, done: 0 };
      continue;
    }
    const task = line.match(/^- \[([ xX])\]\s*(.*)$/);
    if (task) {
      total++;
      if (mi) mi.total++;
      if (task[1] !== " ") {
        done++;
        if (mi) mi.done++;
      } else if (!current) {
        current = task[2].replace(/\*\*/g, "").trim();
      }
    }
  }
  if (mi) milestones.push(mi);
  return { total, done, current, milestones };
}

/* ---------------- Launch guide fallback ---------------- */

/** Used only if the agent didn't write LAUNCH-GUIDE.md — generate a basic one from the stack + tasks. */
export async function generateLaunchGuide(
  productTitle: string,
  choices: StackChoice[],
  graph: TaskGraph | null
): Promise<string> {
  const provider = activeProvider();
  const result = await provider.completeJson<{ markdown: string }>({
    system:
      "Write a LAUNCH-GUIDE.md for a non-developer who just had an AI agent build their app. Markdown, concrete, " +
      "no fluff: keys/accounts to create with exact .env var names, run-locally steps, what to click to verify, " +
      "API route map (infer from the task list), and what the deployment phase will need.",
    effort: "low",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { markdown: { type: "string" } },
      required: ["markdown"],
    },
    messages: [
      {
        role: "user",
        content:
          `PRODUCT: ${productTitle}\nSTACK:\n${stackToText(choices)}\n\nTASKS BUILT:\n` +
          (graph
            ? graph.milestones.map((m) => m.tasks.map((t) => `- ${t.id} ${t.title}`).join("\n")).join("\n")
            : "(unknown)"),
      },
    ],
  });
  return result.markdown;
}
