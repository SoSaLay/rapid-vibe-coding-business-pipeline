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
 * Subheadings shown beneath each phase in the docs sidebar. Display-only for now
 * (structure + future expansion) — they are NOT routed/linked yet. Colocated with
 * PHASES so they can grow into real anchors/sub-routes later.
 */
export const PHASE_SECTIONS: Record<PhaseId, string[]> = {
  "business-owner": ["Capture idea", "Idea type", "Import from a tool"],
  "product-owner": ["Review & questions", "Frameworks", "Product spec"],
  "idea-validation": ["Demand signal", "Competitive landscape", "Verdict"],
  "pre-marketing": ["Validation kit", "Creative direction", "Brand visuals", "Landing page", "Waitlist", "Email"],
  "product-design": ["Design brief", "Mockups", "Design spec"],
  engineering: ["Architect & stack", "Task graph", "Build"],
  qa: ["Test plan", "Manual checklist", "Security", "Report"],
  deployment: ["Environments", "Preflight", "Deploy"],
  "marketing-sales": ["Campaign plan", "Content batches", "Channels"],
  operations: ["Recurring checklist", "Runbooks"],
  iteration: ["Check-in", "Traction read", "Next moves"],
};

export function getPhase(id: PhaseId): PhaseDef | undefined {
  return PHASES.find((p) => p.id === id);
}

export const FIRST_PHASE: PhaseId = "business-owner";
