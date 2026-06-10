/**
 * Tech-stack slot catalog (Phase 6 — Development & Engineering).
 *
 * Nine slots, each with a studio default and warned alternatives. Defaults are
 * applied silently; the "Change tech stack" UI exposes the per-slot options.
 * The architect LLM may propose a deviation only when the product demands it,
 * and every non-default choice carries its tradeoff warning.
 */

export interface StackOption {
  id: string;
  label: string;
  note: string;
  /** Present on non-default options: the honest tradeoff shown to the user. */
  warning?: string;
  status?: "available" | "coming_soon";
}

export interface StackSlot {
  id: string;
  label: string;
  default: string; // option id
  options: StackOption[];
}

export const STACK_SLOTS: StackSlot[] = [
  {
    id: "frontend",
    label: "Frontend",
    default: "nextjs-shadcn",
    options: [
      { id: "nextjs-shadcn", label: "Next.js + shadcn/ui", note: "App Router, Tailwind, shadcn/ui components — pairs directly with the Phase-5 design tokens." },
      { id: "vite-react", label: "Vite + React (SPA)", note: "Lightweight single-page app.", warning: "No SSR/SEO out of the box; weaker fit for marketing pages." },
      { id: "plain-tailwind", label: "Next.js + plain Tailwind", note: "No component library.", warning: "Slower UI build; the agent re-invents components shadcn ships for free." },
    ],
  },
  {
    id: "backend",
    label: "Backend",
    default: "nextjs-api",
    options: [
      { id: "nextjs-api", label: "Next.js API routes / server actions", note: "Backend lives in the same app — zero extra deployables." },
      { id: "aws-lambda", label: "AWS Lambda functions", note: "Separate serverless functions.", warning: "Extra infra + IAM complexity; only worth it for background jobs, queues, or crons." },
      { id: "separate-service", label: "Separate Node service (Hono/Express)", note: "Standalone API server.", warning: "A second deployable to host, monitor, and secure — rarely justified for an MVP." },
    ],
  },
  {
    id: "database",
    label: "Database",
    default: "supabase",
    options: [
      { id: "supabase", label: "Supabase (Postgres)", note: "Postgres + row-level security + storage + realtime, generous free tier." },
      { id: "neon", label: "Neon (Postgres)", note: "Serverless Postgres.", warning: "Database only — you still need separate auth and file storage." },
      { id: "turso", label: "Turso (SQLite)", note: "Edge SQLite.", warning: "Smaller ecosystem; fewer agent-known patterns; no built-in auth/storage." },
    ],
  },
  {
    id: "auth",
    label: "Authentication",
    default: "supabase-auth",
    options: [
      { id: "supabase-auth", label: "Supabase Auth", note: "Free, integrated with the database's row-level security." },
      { id: "clerk", label: "Clerk", note: "Polished prebuilt auth UI, orgs, SSO.", warning: "Second vendor + webhook sync with the database; pick it when you genuinely need orgs/SSO/B2B." },
      { id: "none", label: "No auth", note: "Public app, no accounts.", warning: "Fine for tools/landing apps; painful to retrofit later if accounts become core." },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    default: "none",
    options: [
      { id: "none", label: "None (MVP)", note: "Validate first; add payments when something sells." },
      { id: "stripe", label: "Stripe", note: "The standard. Checkout + customer portal keeps it simple." },
      { id: "clerk-billing", label: "Clerk Billing", note: "Subscriptions managed inside Clerk.", warning: "Requires Clerk as the auth slot; newer and less battle-tested than Stripe." },
    ],
  },
  {
    id: "hosting",
    label: "Hosting",
    default: "aws-amplify",
    options: [
      { id: "aws-amplify", label: "AWS Amplify", note: "All-AWS consistency; CI from the repo. Executed in Phase 8 — decided here." },
      { id: "vercel", label: "Vercel", note: "Smoothest Next.js experience, zero-config previews.", warning: "Leaves the all-AWS setup; separate billing/vendor." },
    ],
  },
  {
    id: "domain",
    label: "Domain",
    default: "route53",
    options: [
      { id: "route53", label: "AWS Route 53", note: "Register + DNS in the same AWS account as hosting." },
      { id: "cloudflare", label: "Cloudflare", note: "Registrar at cost + fast DNS.", warning: "Manual DNS wiring to the host; second dashboard." },
      { id: "subdomain", label: "None (host subdomain)", note: "Ship on the free *.amplifyapp.com / *.vercel.app URL.", warning: "Fine for testing; weak for marketing and trust." },
    ],
  },
  {
    id: "coding-agent",
    label: "Coding agent",
    default: "claude-code",
    options: [
      { id: "claude-code", label: "Claude Code", note: "The build engine. Reads the briefing package and executes the task list; GSD-compatible." },
      { id: "codex-cli", label: "Codex CLI", note: "OpenAI's coding agent.", warning: "Briefing files are agent-agnostic but the start flow is only tested with Claude Code.", status: "coming_soon" },
      { id: "gemini-cli", label: "Gemini CLI", note: "Google's coding agent.", warning: "Briefing files are agent-agnostic but the start flow is only tested with Claude Code.", status: "coming_soon" },
    ],
  },
  {
    id: "ai-model",
    label: "AI model (only if the app itself needs AI)",
    default: "none",
    options: [
      { id: "none", label: "None", note: "The app has no AI features." },
      { id: "claude-api", label: "Claude API", note: "Anthropic API for in-app AI features (latest Claude models).", warning: "Per-token cost scales with usage — budget it into pricing." },
      { id: "other-llm", label: "Other provider", note: "OpenAI / Gemini / open-source.", warning: "Pick deliberately; mixing providers multiplies keys and failure modes.", status: "coming_soon" },
    ],
  },
];

export function getSlot(slotId: string): StackSlot | undefined {
  return STACK_SLOTS.find((s) => s.id === slotId);
}

export interface StackChoice {
  slot: string;
  choice: string; // option id
  rationale: string;
}

/** Normalize LLM/user choices: drop unknown ids, fill missing slots with defaults. */
export function normalizeChoices(raw: StackChoice[]): StackChoice[] {
  const bySlot = new Map(raw.map((c) => [c.slot, c]));
  return STACK_SLOTS.map((slot) => {
    const c = bySlot.get(slot.id);
    const valid = c && slot.options.some((o) => o.id === c.choice && o.status !== "coming_soon");
    return valid ? c! : { slot: slot.id, choice: slot.default, rationale: c ? "Invalid choice — studio default applied." : "Studio default." };
  });
}

/** Render the chosen stack as a compact text block for prompts and briefing files. */
export function stackToText(choices: StackChoice[]): string {
  return choices
    .map((c) => {
      const slot = getSlot(c.slot);
      const opt = slot?.options.find((o) => o.id === c.choice);
      return `- ${slot?.label || c.slot}: ${opt?.label || c.choice}${c.choice !== slot?.default ? " (deviation from default)" : ""}`;
    })
    .join("\n");
}
