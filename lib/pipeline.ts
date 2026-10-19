/**
 * Pipeline definition — the canonical phase order and gating rules.
 * Every phase is a module that reads artifacts it depends on and writes a new one.
 * This file is the single source of truth for the status/gating layer.
 */

export type PhaseId =
  // Not a stage: capture happens on the home page. Kept as the id the raw-idea
  // artifact is stamped with, and so legacy phase_status maps still type-check.
  | "business-owner"
  | "product-owner"
  | "idea-validation"
  | "pre-marketing"
  | "product-design"
  | "agent-design"
  | "engineering"
  | "security"
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
    id: "product-owner",
    name: "Define the Problem",
    short: "Problem",
    consumes: ["raw-idea"],
    produces: ["product-spec"],
    gate: "required",
    description:
      "The brain. An AI product owner pries at the idea — round after round of sharp, customer-first questions — until the real problem is pinned down, then structures it into requirements that steer every downstream phase.",
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
    name: "Engineering & Development",
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
    name: "Operations",
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
    description: "Learnings loop back to Define the Problem to restart the cycle.",
  },
];

/**
 * Pipeline kinds. A "project" runs the product pipeline above; an "agent" runs a
 * variant built for shipping AI agents: same spine and artifact contract, with
 * agent-specific stages (Agent Design, Security, Evaluations) and no market-research, pre-marketing or marketing stages. Missing kind on a stored project = "project" (legacy).
 */
export type PipelineKind = "project" | "agent";

/** Agent-only stage. Placeholder until its tools are chosen — no logic behind it yet. */
const DESIGN_AGENT_PHASE: PhaseDef = {
  id: "agent-design",
  name: "Agent Design",
  short: "Design",
  consumes: ["product-spec"],
  produces: ["agent-design"],
  gate: "optional",
  description:
    "How the agent works before it's built: its job and instructions, the tools and data it can reach, memory and context, the step-by-step workflow, where a human approves, and the model it runs on.",
};

/** Stage order for the agent pipeline. Like the project pipeline, it opens at the problem-definition stage (here: Define the Job). */
const AGENT_ORDER: PhaseId[] = [
  "product-owner",
  "agent-design",
  "engineering",
  // Security now lives inside Engineering's safety checklist ("security" stays a PhaseId for old projects' data).
  "qa",
  "deployment",
  "operations",
  // No Iteration stage for agents: improvements go through the Agent console in Operations
  // (light changes → Evaluations → release), and a bigger rethink starts back at Agent Design.
];

/** What the agent pipeline changes about a shared stage (ids stay the same so the phase modules are reused). */
const AGENT_OVERRIDES: Partial<Record<PhaseId, Partial<PhaseDef>>> = {
  "product-owner": {
    name: "Define the Job",
    description:
      "The problem the agent is solving. An AI product owner pries at the idea through an agent lens — which repetitive task it takes over, how often it happens, what the agent needs access to, and where a human must stay in the loop — then structures it into the spec that steers every downstream stage.",
  },
  qa: {
    name: "Evaluations",
    short: "Evals",
    description:
      "Evaluations first: a test set of real tasks scored for success rate, quality, cost, and latency — then automated, manual, and regression QA of the surrounding build.",
  },
  deployment: {
    // Same name as the project stage; the agent version also covers scaling.
    short: "Deploy",
    description:
      "Dev / UAT / Prod environments, then scaling the agent: concurrency, rate limits, per-run cost ceilings, queues, and fallbacks.",
  },
};

const AGENT_ONLY: Partial<Record<PhaseId, PhaseDef>> = { "agent-design": DESIGN_AGENT_PHASE };

export const AGENT_PHASES: PhaseDef[] = AGENT_ORDER.map((id) => ({
  ...(AGENT_ONLY[id] ?? PHASES.find((p) => p.id === id)!),
  ...AGENT_OVERRIDES[id],
}));

/** The phase list a project of this kind runs. */
export function phasesFor(kind?: string | null): PhaseDef[] {
  return kind === "agent" ? AGENT_PHASES : PHASES;
}

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
export function phaseProducing(artifactType: string, phases: PhaseDef[] = PHASES): PhaseDef | undefined {
  return phases.find((p) => p.produces.includes(artifactType));
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
 * Per-phase artifact menu. Each artifact gets its OWN page at
 * `/project/<id>/<phase>/artifacts/<artifactId>`; the phase page shows them as
 * tiles at the top (see <ArtifactTiles>), and the phase component renders only the
 * selected one. Phases whose artifacts are a single linear flow (Engineering's
 * Execute) are intentionally omitted — they keep one combined page.
 */
export interface ArtifactItem {
  id: string;
  label: string;
  icon: string;
}
export const PHASE_ARTIFACTS: Partial<Record<PhaseId, ArtifactItem[]>> = {
  "pre-marketing": [
    { id: "brand-visuals", label: "Brand visuals", icon: "🎨" },
    { id: "landing", label: "Landing page", icon: "🌐" },
    { id: "waitlist", label: "Waitlist", icon: "📋" },
    { id: "email", label: "Email", icon: "✉️" },
  ],
  "product-design": [
    { id: "logo", label: "Logo & brand", icon: "✨" },
    { id: "mockups", label: "Screen mockups", icon: "🖼️" },
    { id: "approve", label: "Approve & lock", icon: "🔒" },
  ],
  "marketing-sales": [
    { id: "content", label: "Content & posts", icon: "📝" },
    { id: "pomelli", label: "Pomelli assets", icon: "🍊" },
    { id: "email", label: "Launch email", icon: "✉️" },
    { id: "signoff", label: "Sign-off", icon: "✅" },
  ],
};

/**
 * Phases that own an artifact screen at `/project/<id>/<phase>/artifacts`.
 * Confirmed with the founder: Market Researcher, QA, Deployment,
 * Operations and Iteration are read-only and intentionally have no button.
 */
export const PHASES_WITH_ARTIFACTS = new Set<PhaseId>([
  "pre-marketing",
  "product-design",
  "engineering",
  "marketing-sales",
]);

/**
 * The artifact tiles for a phase: one per PHASE_ARTIFACTS entry (`path` is its
 * page under `/artifacts/`), or a single tile opening the combined artifact
 * screen for phases that own one without a menu (Engineering).
 */
export function artifactTiles(phaseId: PhaseId): (ArtifactItem & { path: string })[] {
  const items = PHASE_ARTIFACTS[phaseId];
  if (items) return items.map((it) => ({ ...it, path: `artifacts/${it.id}` }));
  if (PHASES_WITH_ARTIFACTS.has(phaseId)) return [{ id: "build", label: "Build & execute", icon: "🛠️", path: "artifacts" }];
  return [];
}

export function getPhase(id: PhaseId, kind?: string | null): PhaseDef | undefined {
  return phasesFor(kind).find((p) => p.id === id);
}

