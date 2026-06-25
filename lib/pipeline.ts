/**
 * Pipeline definition — the canonical phase order and gating rules.
 * Every phase is a module that reads artifacts it depends on and writes a new one.
 * This file is the single source of truth for the status/gating layer.
 */

export type PhaseId =
  | "business-owner"
  | "product-owner"
  | "idea-validation"
  | "pre-marketing"
  | "product-design"
  | "engineering"
  | "qa"
  | "deployment"
  | "marketing-sales"
  | "operations"
  | "iteration";

export type Gate = "required" | "optional";

export interface PhaseDef {
  id: PhaseId;
  name: string;
  short: string;
  /** What this phase consumes (artifact types) and produces. */
  consumes: string[];
  produces: string[];
  /** required = strict sequential gate; optional = can be skipped. */
  gate: Gate;
  description: string;
}

export const PHASES: PhaseDef[] = [
  {
    id: "business-owner",
    name: "Business Owner",
    short: "Capture",
    consumes: [],
    produces: ["raw-idea"],
    gate: "required",
    description:
      "The front door. Speak or type your raw idea, or pull it from a project-management tool. Emits a raw-idea artifact.",
  },
  {
    id: "product-owner",
    name: "Product Owner",
    short: "Spec",
    consumes: ["raw-idea"],
    produces: ["product-spec"],
    gate: "required",
    description: "The brain. Structures the raw idea into requirements that steer every downstream phase.",
  },
  {
    id: "idea-validation",
    name: "Market Researcher",
    short: "Research",
    consumes: ["product-spec"],
    produces: ["market-report"],
    gate: "optional",
    description:
      "Optional. Combines idea validation + market research: searches real forum/community discussion for demand signal AND researches the competitive landscape, market size, and segments — then delivers a build/refine/reject/archive verdict. Skippable when building for fun; strongly recommended when you intend to monetize.",
  },
  {
    id: "pre-marketing",
    name: "Pre-Marketing",
    short: "Pre-Mkt",
    consumes: ["market-report"],
    produces: ["audience-brief"],
    gate: "optional",
    description: "Audience building, waitlist, early signal capture before the build.",
  },
  {
    id: "product-design",
    name: "Product Design",
    short: "Design",
    consumes: ["product-spec", "market-report"],
    produces: ["design-spec"],
    gate: "optional",
    description: "Design spec, assets, and UX direction.",
  },
  {
    id: "engineering",
    name: "Development & Engineering",
    short: "Build",
    consumes: ["product-spec", "design-spec"],
    produces: ["stack-selection", "task-graph", "build-manifest"],
    gate: "required",
    description:
      "System Design Architect picks the stack and divides work into Claude-executable tasks; Claude Code builds.",
  },
  {
    id: "qa",
    name: "Quality Assurance",
    short: "QA",
    consumes: ["build-manifest"],
    produces: ["qa-report"],
    gate: "required",
    description: "Automated testing, manual testing, and security review.",
  },
  {
    id: "deployment",
    name: "Deployment",
    short: "Deploy",
    consumes: ["build-manifest", "qa-report"],
    produces: ["deploy-manifest"],
    gate: "required",
    description: "Dev / UAT / Prod environments; AWS in production with IAM and deploy configs.",
  },
  {
    id: "marketing-sales",
    name: "Marketing & Sales",
    short: "GTM",
    consumes: ["deploy-manifest", "audience-brief"],
    produces: ["campaign-report"],
    gate: "optional",
    description: "Campaigns, content, and lead generation.",
  },
  {
    id: "operations",
    name: "Operations & Maintenance",
    short: "Ops",
    consumes: ["deploy-manifest"],
    produces: ["ops-report"],
    gate: "optional",
    description: "Release, monitoring, error visibility, maintenance.",
  },
  {
    id: "iteration",
    name: "Iteration",
    short: "Iterate",
    consumes: ["ops-report", "campaign-report"],
    produces: ["iteration-brief"],
    gate: "optional",
    description: "Learnings loop back to the Product Owner to restart the cycle.",
  },
];

/**
 * Hard prerequisites — the artifact that MUST exist before a phase's action can run.
 * This is the real gate the phase components already enforce via their `has*` props
 * (e.g. QA needs a build-manifest). It is deliberately narrower than `consumes`, which
 * also lists optional inputs. Phases not listed here have no hard gate (always runnable).
 * Single source of truth for the "open but action-gated" UI in lib/pipeline-status.ts.
 */
export const HARD_PREREQ: Partial<Record<PhaseId, string>> = {
  "product-owner": "raw-idea",
  engineering: "product-spec",
  qa: "build-manifest",
  deployment: "qa-report",
  "marketing-sales": "deploy-manifest",
  operations: "deploy-manifest",
  iteration: "deploy-manifest",
};

/** The phase that produces a given artifact type (for human-readable blocked reasons). */
export function phaseProducing(artifactType: string): PhaseDef | undefined {
  return PHASES.find((p) => p.produces.includes(artifactType));
}

/**
 * Stable anchor id for a section label. The sidebar links to `#${sectionAnchor(label)}`
 * and <DocSection> derives the same id from its title, so a phase's sidebar entries
 * and document headings stay in lockstep. Keep this the single slug rule.
 */
export function sectionAnchor(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Subheadings shown beneath each phase in the docs sidebar. These are real,
 * clickable anchors into the phase's *document read*: each label must match a
 * <DocSection title> rendered by that phase's component (so
 * `#${sectionAnchor(label)}` resolves to the heading). Artifact deliverables are
 * NOT listed here — they live in PHASE_ARTIFACTS and the artifact menu.
 *
 * Phases whose read is a single flowing thing or an interactive workflow with
 * nothing to break out (Business Owner, Engineering, QA, Deployment, Operations)
 * collapse to ONE heading; its anchor resolves to the phase header (see
 * SINGLE_SECTION_PHASES + the page header id in the workspace page).
 */
export const PHASE_SECTIONS: Record<PhaseId, string[]> = {
  "business-owner": ["The idea"],
  "product-owner": ["Problem solved", "Summary", "Problem & users", "Scope & features", "Risks & monetization"],
  "idea-validation": ["Verdict", "Demand signal", "Market & competitors", "Sources"],
  "pre-marketing": ["Verdict", "Validation kit", "Distribution", "Content library"],
  "product-design": ["Design direction", "Visual language", "UX — screens & flows", "Components & guidelines"],
  engineering: ["Build"],
  qa: ["QA report"],
  deployment: ["Deploy"],
  "marketing-sales": ["Strategy", "Launch checklist"],
  operations: ["Runbook"],
  iteration: ["Check-in", "Traction read", "Next moves"],
};

/**
 * Phases whose single PHASE_SECTIONS heading anchors to the phase header (rather
 * than a <DocSection> in the body) — interactive workflows / trivial reads with
 * nothing to break out. The workspace page stamps the header with the matching id.
 */
export const SINGLE_SECTION_PHASES = new Set<PhaseId>([
  "business-owner",
  "engineering",
  "qa",
  "deployment",
  "operations",
]);

/**
 * Per-phase artifact menu. Each artifact gets its OWN page at
 * `/project/<id>/<phase>/artifacts/<artifactId>`; the sidebar lists them under
 * the phase's "Generate artifact" item, and the phase component renders only the
 * selected one. Phases whose artifacts are a single linear flow (Engineering's
 * Execute) are intentionally omitted — they keep one combined page.
 */
export interface ArtifactItem {
  id: string;
  label: string;
}
export const PHASE_ARTIFACTS: Partial<Record<PhaseId, ArtifactItem[]>> = {
  "product-owner": [{ id: "spec", label: "Spec document" }],
  "pre-marketing": [
    { id: "brand-visuals", label: "Brand visuals" },
    { id: "landing", label: "Landing page" },
    { id: "waitlist", label: "Waitlist" },
    { id: "email", label: "Email" },
  ],
  "product-design": [
    { id: "logo", label: "Logo & brand" },
    { id: "mockups", label: "Screen mockups" },
    { id: "approve", label: "Approve & lock" },
  ],
  "marketing-sales": [
    { id: "content", label: "Content & posts" },
    { id: "pomelli", label: "Pomelli assets" },
    { id: "email", label: "Launch email" },
    { id: "signoff", label: "Sign-off" },
  ],
};

export function getPhase(id: PhaseId): PhaseDef | undefined {
  return PHASES.find((p) => p.id === id);
}

export const FIRST_PHASE: PhaseId = "business-owner";
