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

export function getPhase(id: PhaseId): PhaseDef | undefined {
  return PHASES.find((p) => p.id === id);
}

export const FIRST_PHASE: PhaseId = "business-owner";
