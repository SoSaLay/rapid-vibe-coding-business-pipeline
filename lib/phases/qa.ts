/**
 * Phase 7 — Quality Assurance.
 *
 * The QA director, not the tester. Consumes product-spec + design-spec
 * (optional) + build-manifest and produces:
 *  1. a QA plan — automated test cases, an OWASP-mapped security checklist,
 *     and a manual checklist for the human — written into the app workspace
 *     (QA-PLAN.md + qa/checklist.json) for the coding agent to execute
 *  2. a results contract (qa/results.json) the agent writes back, parsed by
 *     the progress monitor
 *  3. defect fix-rounds appended to TASKS.md when something fails
 *  4. on sign-off, a `qa-report` artifact with a ship verdict → gates Deployment.
 *
 * Process shape: plan → automated run → manual pass → sign-off (the classic
 * 7-stage QA lifecycle collapsed for a solo founder + AI agent). Security is
 * VERIFICATION here — Phase 6 baked the defaults in; QA checks they survived.
 */

import { activeProvider } from "../llm/registry";
import { ideaTypeContext } from "../idea-types";

/* ---------------- Plan types + schema ---------------- */

export interface QaCase {
  id: string;
  area: string;
  title: string;
  steps: string[];
  expected: string;
  kind: "e2e" | "api" | "unit";
}

export interface QaSecurityCheck {
  id: string;
  owasp: string;
  title: string;
  verify: string;
}

export interface QaManualItem {
  id: string;
  title: string;
  instructions: string;
  why_human: string;
}

export interface QaPlan {
  scope_summary: string;
  test_cases: QaCase[];
  security_checks: QaSecurityCheck[];
  manual_checklist: QaManualItem[];
  exit_criteria: string[];
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scope_summary: {
      type: "string",
      description: "2-4 sentences: what this QA pass covers and what it deliberately leaves out.",
    },
    test_cases: {
      type: "array",
      description:
        "Automated cases the coding agent will implement/run. Cover every core flow and every screen's empty/loading/error/success states. Small and independently verifiable.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "TC1, TC2, …" },
          area: { type: "string", description: "Feature area / screen this belongs to." },
          title: { type: "string", description: "Imperative, specific." },
          steps: { type: "array", items: { type: "string" }, description: "Concrete user-facing steps." },
          expected: { type: "string", description: "Observable expected result — never vibes." },
          kind: { type: "string", enum: ["e2e", "api", "unit"] },
        },
        required: ["id", "area", "title", "steps", "expected", "kind"],
      },
    },
    security_checks: {
      type: "array",
      description:
        "Stack-aware security verification checklist. Only include checks that APPLY to this app — skip categories that are N/A rather than padding the list.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "SEC1, SEC2, …" },
          owasp: { type: "string", description: "OWASP Top 10 2021 category, e.g. 'A01 Broken Access Control'." },
          title: { type: "string" },
          verify: { type: "string", description: "The concrete check: what to inspect or attempt, and what proves a pass." },
        },
        required: ["id", "owasp", "title", "verify"],
      },
    },
    manual_checklist: {
      type: "array",
      description:
        "5-10 items ONLY a human should judge: feel, copy tone, real-device behavior, trust. Phrased so a non-developer can do each in under two minutes on their phone.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "MC1, MC2, …" },
          title: { type: "string" },
          instructions: { type: "string", description: "Exactly what to do and look at." },
          why_human: { type: "string", description: "One line: why an agent can't judge this." },
        },
        required: ["id", "title", "instructions", "why_human"],
      },
    },
    exit_criteria: {
      type: "array",
      items: { type: "string" },
      description: "The sign-off bar: what must be true to ship to Deployment.",
    },
  },
  required: ["scope_summary", "test_cases", "security_checks", "manual_checklist", "exit_criteria"],
};

/* ---------------- Plan generation ---------------- */

/**
 * Distilled from the OWASP Top 10 (2021) + OWASP WSTG "during deployment"
 * verification slice, mapped to the studio stack (Next.js + Supabase). Phase 6
 * built these in; QA verifies they survived the build.
 */
const SECURITY_GUIDANCE = `OWASP Top 10 (2021) mapped to this stack — include only the categories that apply to THIS app:
- A01 Broken Access Control: every protected route/server action rejects unauthenticated AND unauthorized requests server-side; every Supabase table has an RLS policy; object ids in URLs/params are checked against the requesting user (no IDOR).
- A02 Cryptographic Failures: no secrets or service-role key in client code, NEXT_PUBLIC_ vars, or the browser bundle; no sensitive data in localStorage or logs.
- A03 Injection: all external input (route bodies, query params, form data) validated with zod at the boundary; no string-concatenated SQL; no dangerouslySetInnerHTML with user-influenced content.
- A05 Security Misconfiguration: security headers present (CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy); error responses don't leak stack traces; no debug/test endpoints left in.
- A06 Vulnerable Components: npm audit shows zero criticals; lockfile committed.
- A07 Auth Failures: signup/login/logout/session flows work and fail safely; auth endpoints and public write endpoints are rate-limited.
- A08 Integrity Failures: dependencies come from the lockfile; no remote scripts without integrity checks. Usually N/A beyond that for an MVP.
- A09 Logging Failures: auth failures and 5xx errors are logged server-side; logs contain no secrets, tokens, or PII.
- A10 SSRF: any server-side fetch of a user-supplied URL is validated/allowlisted. N/A if the app never fetches user-supplied URLs.
- A04 Insecure Design is a design-phase concern — only flag something glaring.`;

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

export async function generateQaPlan(
  spec: Record<string, any>,
  design: Record<string, any> | null,
  manifest: Record<string, any>,
  productTitle: string,
  extraContext = ""
): Promise<QaPlan> {
  const provider = activeProvider();
  const screens = design?.ux?.screens
    ? (design.ux.screens as any[])
        .map((s) => `- ${s.name}: ${s.purpose} (states: empty/loading/error/success)`)
        .join("\n")
    : "(no design-spec — derive screens and states from the product spec)";
  const stack = Array.isArray(manifest.stack)
    ? manifest.stack.map((c: any) => `${c.slot}: ${c.choice}`).join(", ")
    : "(unknown — assume the studio defaults: Next.js, Supabase)";

  return provider.completeJson<QaPlan>({
    system:
      "You are a pragmatic QA lead writing the test plan for an MVP that an AI coding agent just built and will also " +
      "test. A solo non-developer founder runs the manual pass from their phone. Principles:\n" +
      "- Test user-facing behavior, not implementation details. Every case's expected result must be observable.\n" +
      "- Cover every core flow end-to-end and every screen's empty/loading/error/success states. Don't over-test: " +
      "one case per behavior, no redundant permutations.\n" +
      "- Security here is VERIFICATION — the build was briefed to include these defaults; check they actually exist " +
      "in the code and behave under attack-shaped input.\n" +
      "- The manual checklist is ONLY for human judgment (feel, copy, trust, real-device quirks) — never duplicate " +
      "what an automated case already covers.\n" +
      "- Exit criteria are the ship bar: suite green, zero failed cases, zero failed security checks, zero critical " +
      "audit findings, manual checklist complete. Add app-specific criteria only when genuinely warranted.\n\n" +
      SECURITY_GUIDANCE +
      extraContext,
    effort: "high",
    schema: PLAN_SCHEMA,
    messages: [
      {
        role: "user",
        content:
          `PRODUCT: ${productTitle}\n\nSPEC:\n${specToText(spec)}\n\nSCREENS:\n${screens}\n\nSTACK: ${stack}\n\n` +
          `BUILD: ${manifest.tasks_done}/${manifest.tasks_total} tasks completed${manifest.forced ? " (build was force-completed — be suspicious; probe the unchecked areas)" : ""}.\n\n` +
          "Produce the QA plan: automated test cases, applicable security checks, the human manual checklist, and exit criteria.",
      },
    ],
  });
}

/* ---------------- Workspace briefing renderer (deterministic) ---------------- */

export const QA_RESULTS_PATH = "qa/results.json";
export const QA_CHECKLIST_PATH = "qa/checklist.json";

export function renderQaPlanMd(plan: QaPlan, productTitle: string): string {
  const lines: string[] = [
    `# QA PLAN — ${productTitle}`,
    "",
    "> Executed by the coding agent. Work this file top-to-bottom, then write the results",
    "> contract EXACTLY as specified below — the pipeline dashboard reads `qa/results.json`.",
    "",
    `Scope: ${plan.scope_summary}`,
    "",
    "## Execution discipline",
    "",
    "1. Read `qa/checklist.json` (machine copy of this plan), `SPECS/`, and the codebase.",
    "2. Baseline first: `npx tsc --noEmit`, the test suite, and a production build must run. Record their status.",
    "3. For each test case below: if a test covering it exists, run it; otherwise WRITE it first",
    "   (Playwright for e2e, Vitest for unit/api — follow this repo's existing test conventions), then run it.",
    "4. For each security check: inspect the code / attempt the attack-shaped input it describes. Record honestly.",
    "5. Run `npm audit` and record critical/high/moderate counts.",
    "6. If a failure has an obvious, safe, small fix: you MAY fix it, commit as `qa-fix: <what>`, re-run, and list it",
    "   under `fixed_during_qa`. Anything bigger: record the failure and move on — fixes come back as tasks.",
    "7. NEVER mark a case pass that didn't run green. An honest fail is worth more than a polite pass.",
    "8. When everything has a status: write `qa/results.json` (contract below) and a human-readable `QA-RESULTS.md`,",
    "   then commit both.",
    "",
    "## Results contract — write to `qa/results.json`",
    "",
    "```json",
    JSON.stringify(
      {
        completed_at: "<ISO timestamp>",
        suite: { typecheck: "pass|fail", tests: "pass|fail|none", build: "pass|fail" },
        cases: [{ id: "TC1", status: "pass|fail|skip", notes: "required when not pass" }],
        security: [{ id: "SEC1", status: "pass|fail|na", notes: "required when fail" }],
        npm_audit: { critical: 0, high: 0, moderate: 0 },
        fixed_during_qa: ["qa-fix commits, one line each"],
      },
      null,
      2
    ),
    "```",
    "",
    "Every case id and security id from this plan MUST appear exactly once.",
    "",
    "## Automated test cases",
    "",
  ];
  for (const c of plan.test_cases) {
    lines.push(`### ${c.id} — ${c.title} (${c.kind}, ${c.area})`);
    for (const s of c.steps) lines.push(`- ${s}`);
    lines.push(`- **Expected:** ${c.expected}`, "");
  }
  lines.push("## Security verification checklist", "");
  for (const s of plan.security_checks) {
    lines.push(`### ${s.id} — ${s.title} (${s.owasp})`, `- ${s.verify}`, "");
  }
  lines.push(
    "## Manual checklist (human-run — NOT yours)",
    "",
    "The founder runs these in the pipeline dashboard. Listed for context only — do not execute or mark them.",
    ""
  );
  for (const m of plan.manual_checklist) lines.push(`- ${m.id}: ${m.title}`);
  lines.push("", "## Exit criteria", "");
  for (const e of plan.exit_criteria) lines.push(`- ${e}`);
  lines.push("");
  return lines.join("\n");
}

/* ---------------- Results parsing ---------------- */

export interface QaResults {
  completed_at: string | null;
  suite: { typecheck: string; tests: string; build: string } | null;
  cases: { id: string; status: "pass" | "fail" | "skip"; notes?: string }[];
  security: { id: string; status: "pass" | "fail" | "na"; notes?: string }[];
  npm_audit: { critical: number; high: number; moderate: number } | null;
  fixed_during_qa: string[];
}

export function parseQaResults(raw: string): QaResults | null {
  try {
    const d = JSON.parse(raw);
    const norm = (s: any, allowed: string[]) => (allowed.includes(s) ? s : "fail");
    return {
      completed_at: typeof d.completed_at === "string" ? d.completed_at : null,
      suite: d.suite
        ? {
            typecheck: String(d.suite.typecheck ?? "fail"),
            tests: String(d.suite.tests ?? "fail"),
            build: String(d.suite.build ?? "fail"),
          }
        : null,
      cases: Array.isArray(d.cases)
        ? d.cases.map((c: any) => ({
            id: String(c.id ?? "?"),
            status: norm(c.status, ["pass", "fail", "skip"]),
            notes: c.notes ? String(c.notes) : undefined,
          }))
        : [],
      security: Array.isArray(d.security)
        ? d.security.map((s: any) => ({
            id: String(s.id ?? "?"),
            status: norm(s.status, ["pass", "fail", "na"]),
            notes: s.notes ? String(s.notes) : undefined,
          }))
        : [],
      npm_audit: d.npm_audit
        ? {
            critical: Number(d.npm_audit.critical ?? 0),
            high: Number(d.npm_audit.high ?? 0),
            moderate: Number(d.npm_audit.moderate ?? 0),
          }
        : null,
      fixed_during_qa: Array.isArray(d.fixed_during_qa) ? d.fixed_during_qa.map(String) : [],
    };
  } catch {
    return null;
  }
}

/* ---------------- Manual responses + sign-off evaluation ---------------- */

export interface ManualResponse {
  id: string;
  status: "pass" | "fail" | "na";
  note?: string;
}

export interface ExitEvaluation {
  ready: boolean;
  blockers: string[];
}

/** The deterministic ship bar. `blockers` is human-readable and shown in the UI. */
export function evaluateExit(plan: QaPlan, results: QaResults | null, manual: ManualResponse[]): ExitEvaluation {
  const blockers: string[] = [];

  if (!results) {
    blockers.push("Automated run hasn't reported results yet (qa/results.json missing).");
  } else {
    if (results.suite) {
      if (results.suite.typecheck !== "pass") blockers.push("Typecheck failing.");
      if (results.suite.tests === "fail") blockers.push("Test suite failing.");
      if (results.suite.build !== "pass") blockers.push("Production build failing.");
    } else {
      blockers.push("Suite baseline (typecheck/tests/build) not reported.");
    }
    const missingCases = plan.test_cases.filter((c) => !results.cases.some((r) => r.id === c.id));
    if (missingCases.length) blockers.push(`${missingCases.length} test case(s) have no result.`);
    const failedCases = results.cases.filter((c) => c.status === "fail");
    if (failedCases.length) blockers.push(`${failedCases.length} test case(s) failing: ${failedCases.map((c) => c.id).join(", ")}.`);
    const failedSec = results.security.filter((s) => s.status === "fail");
    if (failedSec.length) blockers.push(`${failedSec.length} security check(s) failing: ${failedSec.map((s) => s.id).join(", ")}.`);
    if (results.npm_audit && results.npm_audit.critical > 0) {
      blockers.push(`npm audit: ${results.npm_audit.critical} critical vulnerability(ies).`);
    }
  }

  const unanswered = plan.manual_checklist.filter((m) => !manual.some((r) => r.id === m.id));
  if (unanswered.length) blockers.push(`${unanswered.length} manual checklist item(s) not done.`);
  const manualFails = manual.filter((r) => r.status === "fail");
  if (manualFails.length) blockers.push(`${manualFails.length} manual item(s) marked fail: ${manualFails.map((r) => r.id).join(", ")}.`);

  return { ready: blockers.length === 0, blockers };
}

/* ---------------- Defect fix-rounds ---------------- */

export interface Defect {
  id: string;
  title: string;
  notes?: string;
}

/** Render a fix-round milestone to append to the workspace TASKS.md. */
export function renderFixRound(round: number, defects: Defect[]): string {
  const lines: string[] = [
    "",
    `## QA-R${round} — QA fix round ${round}`,
    "",
    `Goal: every defect below resolved; the originating QA check passes on re-run.`,
    "",
  ];
  defects.forEach((d, i) => {
    lines.push(`- [ ] **QF${round}.${i + 1}** Fix: ${d.title}`);
    if (d.notes) lines.push(`  - ${d.notes}`);
    lines.push(`  - ✓ QA check ${d.id} passes when the QA pass is re-run`);
  });
  lines.push("");
  return lines.join("\n");
}
