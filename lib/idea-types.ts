/**
 * Idea-type taxonomy (Phase 1 label, Phase 6 Part B).
 *
 * The Business Owner labels the idea at capture. The label is stored on the
 * project meta + raw-idea artifact, stamped into the product-spec at synthesis,
 * and every downstream phase injects `ideaTypeContext()` so its output adapts
 * to what's actually being built. Nearly every type still ships a simple
 * website — the label shifts emphasis and stack defaults, not the backbone.
 */

export interface IdeaType {
  id: string;
  label: string;
  icon: string;
  /** One line shown in the capture picker. */
  blurb: string;
  /** Pipeline-wide context injected into downstream LLM prompts. */
  implications: string;
}

export const IDEA_TYPES: IdeaType[] = [
  {
    id: "web-app",
    label: "Web application",
    icon: "🖥️",
    blurb: "A product people use in the browser — the pipeline's native lane.",
    implications:
      "Standard web application: the studio defaults (Next.js + Supabase + shadcn/ui) apply as-is. " +
      "Design and engineering target responsive browser screens; marketing drives traffic to the app itself.",
  },
  {
    id: "mobile-app",
    label: "Mobile application",
    icon: "📱",
    blurb: "An iOS/Android app — plus a simple marketing site.",
    implications:
      "Mobile application: the build splits in two — the app itself (React Native + Expo is the agent-friendly default; " +
      "flag the frontend slot as a deviation) and a simple marketing/landing website on the standard web stack. " +
      "Design must think in native patterns (tab bars, gestures, 44pt targets); research should check app-store competition.",
  },
  {
    id: "web-mobile-app",
    label: "Web + mobile application",
    icon: "🖥️📱",
    blurb: "Both surfaces sharing one backend.",
    implications:
      "Web + mobile application: one shared backend (Supabase), two frontends — web first (Next.js), mobile second " +
      "(React Native + Expo). Spec and tasks should sequence web → mobile so the MVP ships sooner; design tokens are shared.",
  },
  {
    id: "ai-agent",
    label: "AI agent / agent team",
    icon: "🤖",
    blurb: "The product IS an agent (or crew) doing work for users.",
    implications:
      "AI agent product: the core is agent logic (LLM calls, tools, memory) — the AI-model stack slot is REQUIRED, not optional. " +
      "It still ships wrapped in a web dashboard (runs, results, settings) on the standard stack. Spec must define the agent's " +
      "job, tools, and guardrails; per-run token cost belongs in pricing; design focuses on trust (showing work, progress, failures).",
  },
  {
    id: "browser-extension",
    label: "Browser extension",
    icon: "🧩",
    blurb: "Lives in Chrome/Firefox — plus a landing page.",
    implications:
      "Browser extension: the deliverable is a Manifest V3 extension (vanilla TS or WXT framework — frontend slot deviation) " +
      "plus a landing site for distribution. Design is constrained to popup/side-panel/content-script surfaces; " +
      "research should check the Chrome Web Store for competitors; hosting matters only for the landing page and any sync API.",
  },
  {
    id: "api-dev-tool",
    label: "API / developer tool",
    icon: "🛠️",
    blurb: "An API, SDK, or CLI for developers — docs are the UI.",
    implications:
      "Developer tool: the product is an API/SDK/CLI; the 'UI' is documentation + a landing page with code examples. " +
      "Spec must define the public interface precisely (endpoints/commands, auth, errors). Design emphasis shifts to docs " +
      "IA and DX; marketing targets developer channels (GitHub, dev forums) and pricing is usually usage-based.",
  },
  {
    id: "community",
    label: "Community / paid group",
    icon: "👥",
    blurb: "A paid community, online or in real life.",
    implications:
      "Community / paid group: the 'build' is light — a landing/sales site, a payment link (Stripe), and setup of the community " +
      "platform (Skool/Discord/Circle) rather than custom software. Engineering should produce a much smaller task graph; " +
      "the heavy phases are positioning, pre-marketing, and ongoing content/marketing. Validation = people paying to join.",
  },
  {
    id: "physical-product",
    label: "Physical product",
    icon: "📦",
    blurb: "A real-world product — the pipeline builds its storefront and brand.",
    implications:
      "Physical product (workaround mode): manufacturing/fulfillment stay human; the pipeline builds the storefront or " +
      "pre-order landing site, brand assets, and waitlist/pre-sale funnel. Payments slot defaults to Stripe pre-orders; " +
      "research focuses on price points and existing alternatives; design carries the brand into packaging-ready tokens.",
  },
  {
    id: "content-brand",
    label: "Content / media brand",
    icon: "🎬",
    blurb: "Newsletter, YouTube, podcast — an audience business.",
    implications:
      "Content / media brand: the build is a content site + subscribe funnel (newsletter capture, episode/post pages); " +
      "the heavy phases are pre-marketing and marketing — the content library and distribution plan ARE the product engine. " +
      "Monetization usually arrives later (sponsors, paid tier via Stripe); engineering task graph stays small.",
  },
];

export function getIdeaType(id?: string | null): IdeaType | undefined {
  return IDEA_TYPES.find((t) => t.id === id);
}

export function isValidIdeaType(id?: string | null): boolean {
  return !!getIdeaType(id);
}

/**
 * The context block downstream phases inject into their prompts.
 * Defaults to web-app when the label is missing (legacy projects).
 */
export function ideaTypeContext(id?: string | null): string {
  const t = getIdeaType(id) || getIdeaType("web-app")!;
  return `PROJECT TYPE: ${t.label}.\n${t.implications}`;
}
