"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------- status hook ---------------- */

export interface OnboardingStatus {
  anthropic: boolean;
  openai: boolean;
  /** Which engine the pipeline runs on ("ai-anthropic" | "ai-openai"). */
  activeLlm: string;
  exa: boolean;
  google: boolean;
  supabase: boolean;
  resend: boolean;
  posthog: boolean;
  langfuse: boolean;
  langsmith: boolean;
  aws: boolean;
  railway: boolean;
  /** A GitHub token saved here, or this Mac's GitHub CLI sign-in. */
  github: boolean;
  /** An LLM engine (Claude OR OpenAI) connected — gates pipeline progression. */
  requiredComplete: boolean;
  /** Every slot connected — drives the "complete" (green) button state. */
  allComplete: boolean;
}

export function useOnboarding() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/onboarding");
      setStatus(await r.json());
    } catch {
      /* leave as-is */
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { status, reload };
}

/* ---------------- service metadata ---------------- */

interface Field {
  name: string;
  label: string;
  type?: string;
  /** Not needed to connect — the row's Connect button ignores it when empty. */
  optional?: boolean;
  /** Prefilled value (e.g. the PostHog US host most people want). */
  defaultValue?: string;
}
/* ---------------- AI engine (LLM) options ---------------- */

interface LlmOption {
  id: "ai-anthropic" | "ai-openai";
  statusKey: "anthropic" | "openai";
  label: string;
  recommended?: boolean;
  docs: string[];
  docsUrl: string;
}

const LLM_OPTIONS: LlmOption[] = [
  {
    id: "ai-anthropic",
    statusKey: "anthropic",
    label: "Claude (Anthropic)",
    recommended: true,
    docsUrl: "https://console.anthropic.com/settings/keys",
    docs: [
      "Sign in at console.anthropic.com (create an account if you don't have one).",
      "Add a payment method under Billing — a card on file is required before any key works.",
      "Go to Settings → API Keys (console.anthropic.com/settings/keys).",
      "Click 'Create Key', give it a name, then 'Create Key'.",
      "Copy the key (starts with sk-ant-) — it's shown only once — and paste it below.",
    ],
  },
  {
    id: "ai-openai",
    statusKey: "openai",
    label: "OpenAI (ChatGPT)",
    docsUrl: "https://platform.openai.com/api-keys",
    docs: [
      "Sign in at platform.openai.com.",
      "Add credit under Settings → Billing (API use needs a balance; $5 minimum).",
      "Go to Settings → API keys (platform.openai.com/api-keys).",
      "Click 'Create new secret key', then copy it (sk-…) — it's shown only once.",
      "Paste it below. Uses gpt-5.5 by default; set OPENAI_MODEL to pick another model.",
    ],
  },
];

interface Service {
  id: "exa" | "google" | "supabase" | "resend" | "posthog" | "langfuse" | "aws" | "railway" | "github";
  label: string;
  /** Why it matters / what connecting it unlocks. */
  unlocks: string;
  help: string;
  /** Step-by-step "how to get this key", shown behind the ℹ️ info button. */
  docs: string[];
  /** Where to go to create the key. */
  docsUrl: string;
  fields: Field[];
}

const SERVICES: Service[] = [
  {
    id: "exa",
    label: "Exa (market search)",
    unlocks: "Unlocks Market Research — live demand & competitor signal for your idea.",
    help: "Free key at dashboard.exa.ai → API Keys.",
    docsUrl: "https://dashboard.exa.ai/api-keys",
    docs: [
      "Sign in at dashboard.exa.ai (free to start).",
      "Open 'API Keys' in the left menu (dashboard.exa.ai/api-keys).",
      "Click '+ Create new key' and give it a reference name.",
      "Copy the key — it's only shown once — and paste it below.",
    ],
    fields: [{ name: "apiKey", label: "Exa API key", type: "password" }],
  },
  {
    id: "google",
    label: "Google / Gemini (visuals)",
    unlocks: "Unlocks brand visuals (Nano Banana) and the Stitch design engine.",
    help: "Free key at aistudio.google.com → Get API key.",
    docsUrl: "https://aistudio.google.com/app/apikey",
    docs: [
      "Go to aistudio.google.com and sign in with your Google account; accept the terms on first visit.",
      "Click 'Get API key' in the left sidebar (aistudio.google.com/app/apikey).",
      "Click 'Create API key' → 'Create API key in new project'.",
      "Copy the key (starts with AIza) and paste it below. Generous free tier — no card needed to start.",
    ],
    fields: [{ name: "apiKey", label: "Google AI (Gemini) API key", type: "password" }],
  },
  {
    id: "supabase",
    label: "Supabase (waitlist)",
    unlocks: "Unlocks the Pre-Marketing waitlist store + signups dashboard.",
    help: "Free project at supabase.com → Project Settings → API Keys.",
    docsUrl: "https://supabase.com/dashboard",
    docs: [
      "Create a free project at supabase.com (New project). Leave 'Automatic RLS' OFF during creation.",
      "Once the project is created, go to Settings in the left-hand sidebar, then open API Keys.",
      "At the top of the API Keys page, switch to the legacy anon / service_role keys.",
      "Copy the anon (public) key and the service_role key — keep service_role secret, server-side only.",
      "Project URL: click the green 'Connect' button at the top, stay on the App Frameworks (client library) tab, and scroll down to the .env variables — your URL (https://xxxx.supabase.co) is listed there.",
      "Paste the URL and both keys below, then run the SQL snippet that appears after saving to create the signups table + RLS policy.",
    ],
    fields: [
      { name: "url", label: "Project URL (https://xxxx.supabase.co)" },
      { name: "anonKey", label: "anon public key", type: "password" },
      { name: "serviceKey", label: "service_role key", type: "password" },
    ],
  },
  {
    id: "resend",
    label: "Resend (email)",
    unlocks: "Unlocks waitlist broadcasts + product/marketing email (opt-in per project).",
    help: "Free key at resend.com → API Keys. Auth and billing emails stay with Clerk.",
    docsUrl: "https://resend.com/api-keys",
    docs: [
      "Sign up free at resend.com — 3,000 emails/mo (100/day), no card to start.",
      "Open 'API Keys' in the left sidebar (resend.com/api-keys) → 'Create API Key' (Full access or Sending access).",
      "Copy the key (starts with re_) — it's shown once — and paste it below.",
      "Optional, to send from your own address: go to Domains → add your domain → add the shown DNS records at your registrar. Until then, sends use Resend's test address to your own inbox.",
      "No Supabase setup is needed — the pipeline bridges your waitlist to Resend automatically.",
    ],
    fields: [{ name: "apiKey", label: "Resend API key (re_…)", type: "password" }],
  },
  {
    id: "posthog",
    label: "PostHog (analytics)",
    unlocks: "Measures the landing pages and apps you ship — visitors, funnel drop-off, signups.",
    help: "Free key at posthog.com → Settings → Project. The personal key is optional but lets the pipeline read your numbers back.",
    docsUrl: "https://app.posthog.com/settings/project",
    docs: [
      "Sign up free at posthog.com — 1M events/mo on the free tier, no card to start. Pick the US or EU region (it can't be changed later).",
      "Project API key: Settings → Project → 'Project API key' (starts with phc_). This one is public — it goes into the pages you ship.",
      "Host: use https://us.i.posthog.com for the US region or https://eu.i.posthog.com for the EU. It's prefilled to US below.",
      "Optional — Personal API key: click your avatar → Personal API keys → 'Create personal API key'. Give it read scopes for Query and Project. This is what lets Ops and Iteration pull your real numbers instead of asking you to remember them.",
      "Paste them below. Analytics only fires on deployed pages — local previews are excluded so your own testing never pollutes the data.",
    ],
    fields: [
      { name: "projectApiKey", label: "Project API key (phc_…)", type: "password" },
      { name: "host", label: "Host", defaultValue: "https://us.i.posthog.com" },
      { name: "personalApiKey", label: "Personal API key (phx_…) — optional, unlocks reading stats", type: "password", optional: true },
    ],
  },
  {
    id: "langfuse",
    label: "Langfuse (tracing & evals)",
    unlocks: "See every agent run step by step, and every evaluation run, in one dashboard.",
    help: "Free cloud tier at us.cloud.langfuse.com, or self-host it free (open source).",
    docsUrl: "https://us.cloud.langfuse.com",
    docs: [
      "Sign up free at us.cloud.langfuse.com (the Hobby tier needs no card), or self-host Langfuse with Docker.",
      "Create an organization and a project.",
      "In the project, open Settings → API Keys → 'Create new API keys'.",
      "Copy the Secret key (sk-lf-…) and Public key (pk-lf-…) and paste them below.",
      "Host is set to the US cloud (https://us.cloud.langfuse.com). Use https://cloud.langfuse.com for EU, or your own server's URL.",
    ],
    fields: [
      { name: "secretKey", label: "Secret key (sk-lf-…)", type: "password" },
      { name: "publicKey", label: "Public key (pk-lf-…)" },
      { name: "host", label: "Host", defaultValue: "https://us.cloud.langfuse.com" },
    ],
  },
  {
    id: "aws",
    label: "Amazon Bedrock AgentCore (AWS)",
    unlocks: "Uses this computer's AWS sign-in to deploy your agents. No keys to copy.",
    help: "If the AWS CLI on this computer is signed in, just press Save.",
    docsUrl: "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html",
    docs: [
      "If you've already signed in to the AWS CLI on this computer, leave the fields as they are and press Save.",
      "Not signed in yet? Install the AWS CLI (docs.aws.amazon.com/cli), then run \"aws configure sso\" (or \"aws configure\") in a terminal and sign in.",
      "Using a named profile? Type its name in Profile.",
      "No CLI? Paste an access key and secret instead (IAM → Users → Security credentials → Create access key).",
    ],
    fields: [
      { name: "profile", label: "AWS CLI profile", defaultValue: "default" },
      { name: "region", label: "Region", defaultValue: "us-east-1" },
      { name: "accessKeyId", label: "Access key ID (only if not using the CLI)", optional: true },
      { name: "secretAccessKey", label: "Secret access key (only if not using the CLI)", type: "password", optional: true },
    ],
  },
  {
    id: "github",
    label: "GitHub",
    unlocks: "Backs up each agent's code in a private repo and lets GitHub test and release every change for you.",
    help: "Already signed in to the GitHub CLI (gh) on this Mac? It's used automatically: nothing to paste.",
    docsUrl: "https://github.com/settings/personal-access-tokens/new",
    docs: [
      "Signed in to the GitHub CLI on this Mac (gh auth login)? You're done: GitHub shows as connected.",
      "Otherwise, open GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.",
      "Repository access: All repositories. Permissions: Administration, Contents, Secrets, Workflows and Environments → Read and write.",
      "Copy the token (github_pat_…) and paste it below.",
    ],
    fields: [{ name: "token", label: "Personal access token (github_pat_…)", type: "password" }],
  },
  {
    id: "railway",
    label: "Railway",
    unlocks: "Hosts your agents on Railway: it builds the Docker image for you.",
    help: "Project tokens from railway.com. Hobby plan is about $5/month including $5 of usage.",
    docsUrl: "https://railway.com/dashboard",
    docs: [
      "Sign up at railway.com and create a new project (an empty one is fine).",
      "Add an empty service to it, then Settings → Networking → 'Generate domain' so it gets a public URL.",
      "Optional: add a second environment named 'staging' (Project → Environments) for test releases.",
      "Project Settings → Tokens → create a token for the production environment (and one for staging, if you made it).",
      "Paste the tokens below. You'll paste the service URL(s) on the agent's Deployment page.",
    ],
    fields: [
      { name: "productionToken", label: "Production project token", type: "password" },
      { name: "stagingToken", label: "Staging project token (optional)", type: "password", optional: true },
    ],
  },
];

async function connectLlm(id: LlmOption["id"], apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/ai/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id, credentials: { apiKey } }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.ok === false) return { ok: false, error: d.error || "Connection failed." };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error." };
  }
}

async function activateLlm(id: LlmOption["id"]): Promise<void> {
  await fetch("/api/ai/active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: id }),
  }).catch(() => {});
}

async function connectService(id: Service["id"], values: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  let endpoint = "";
  let payload: Record<string, any> = {};
  if (id === "exa") {
    endpoint = "/api/exa/configure";
    payload = { apiKey: values.apiKey };
  } else if (id === "google") {
    endpoint = "/api/google/configure";
    payload = { apiKey: values.apiKey };
  } else if (id === "resend") {
    endpoint = "/api/email/configure";
    payload = { apiKey: values.apiKey };
  } else if (id === "posthog") {
    endpoint = "/api/posthog/configure";
    payload = {
      projectApiKey: values.projectApiKey,
      host: values.host,
      personalApiKey: values.personalApiKey,
    };
  } else if (id === "github") {
    endpoint = "/api/github/configure";
    payload = { token: values.token };
  } else if (id === "langfuse" || id === "aws" || id === "railway") {
    endpoint = "/api/agent-tools/configure";
    payload = { id, values };
  } else {
    endpoint = "/api/supabase/configure";
    payload = { url: values.url, anonKey: values.anonKey, serviceKey: values.serviceKey };
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.ok === false) return { ok: false, error: d.error || "Connection failed." };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error." };
  }
}

/** Prefilled field values (only fields that declare a default). */
function initialValues(service: Service): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of service.fields) if (f.defaultValue) v[f.name] = f.defaultValue;
  return v;
}

/* ---------------- the toolbox ---------------- */

export type PipelineKindKey = "project" | "agent";

/**
 * A tool the agent pipeline will use but that isn't wired to anything yet.
 * Listed so the toolbox shows the whole shape of the pipeline up front.
 */
interface PlaceholderTool {
  id: string;
  label: string;
  blurb: string;
  /** Status words for the table; defaults to "Coming soon". */
  statusText?: string;
}

type ToolDef =
  | { type: "llm"; def: LlmOption }
  | { type: "service"; def: Service }
  | { type: "placeholder"; def: PlaceholderTool };

/**
 * One JOB the pipeline needs done (AI engine, market search, web host…). When
 * several tools can do the job they're all listed as options and the owner
 * picks ONE — the table shows them as a "pick one" switch, never as extra rows.
 */
interface Slot {
  id: string;
  label: string;
  /** The pipeline section(s) this job powers. */
  section: string;
  options: ToolDef[];
}

const llm = (id: LlmOption["id"]): ToolDef => ({ type: "llm", def: LLM_OPTIONS.find((o) => o.id === id)! });
const service = (id: Service["id"]): ToolDef => ({ type: "service", def: SERVICES.find((s) => s.id === id)! });
const placeholder = (def: PlaceholderTool): ToolDef => ({ type: "placeholder", def });

/** Claude and OpenAI each get a line under "Every stage" — only one needs a key. */
const AI_ENGINES: Slot[] = [
  { id: "ai-anthropic", label: "AI engine", section: "Every stage", options: [llm("ai-anthropic")] },
  { id: "ai-openai", label: "AI engine", section: "Every stage", options: [llm("ai-openai")] },
];


/**
 * One toolbox per pipeline. Keys are global (stored once, reused by every
 * project); the toolbox only decides which jobs a pipeline shows.
 *
 * Agent slots mirror release-deployment.md. LangChain-ecosystem tools are the
 * DEFAULT option in each, not the only one — more options join a slot's switch
 * as they're wired. TODO: generate these from the lib/agent/ registries.
 */
const TOOLBOX: Record<PipelineKindKey, Slot[]> = {
  project: [
    ...AI_ENGINES,
    { id: "market-search", label: "Market search", section: "Market Researcher", options: [service("exa")] },
    { id: "images", label: "Images & design", section: "Pre-Marketing · Product Design", options: [service("google")] },
    { id: "waitlist", label: "Waitlist database", section: "Pre-Marketing", options: [service("supabase")] },
    { id: "email", label: "Email", section: "Pre-Marketing · Marketing & Sales", options: [service("resend")] },
    { id: "analytics", label: "Analytics", section: "Operations · Iteration", options: [service("posthog")] },
  ],
  agent: [
    ...AI_ENGINES.map((e) => ({ ...e, label: "Agent building engine" })),
    {
      id: "framework",
      label: "Agent framework",
      section: "Agent Development",
      options: [
        placeholder({ id: "langchain", label: "LangChain", blurb: "Model and tool integrations, plus create_agent — the loop with structured responses.", statusText: "No key needed" }),
        placeholder({ id: "crewai", label: "CrewAI", blurb: "Teams of role-based agents that hand work to each other (Python). Not wired yet." }),
      ],
    },
    {
      id: "validation",
      label: "Structured output & validation",
      section: "Agent Development",
      options: [
        placeholder({
          id: "pydantic",
          label: "Pydantic",
          blurb: "Defines the exact shape of every answer and checks every tool's inputs before it runs, so the agent can't hand back malformed data. Built into every agent.",
          statusText: "Built in",
        }),
      ],
    },
    {
      id: "tracing",
      label: "Agent monitoring",
      section: "Agent monitoring",
      options: [service("langfuse")],
    },
    {
      id: "approval",
      label: "Human approval",
      section: "Security",
      options: [placeholder({ id: "langgraph", label: "LangGraph", blurb: "Interrupts pause consequential actions until a human approves.", statusText: "No key needed" })],
    },
    {
      id: "runtime",
      label: "Agent deployment",
      section: "Deployment",
      options: [service("aws"), service("railway")],
    },
    {
      id: "web-host",
      label: "Chat page (only if people need to talk to the agent)",
      section: "Deployment",
      options: [placeholder({ id: "vercel", label: "Vercel", blurb: "Hosts the login-protected chat page. Agents that run on their own skip it." })],
    },
    {
      id: "github",
      label: "Agent automated releases",
      section: "Deployment",
      options: [service("github")],
    },
  ],
};

function toolboxFor(kind?: string | null): Slot[] {
  return TOOLBOX[kind === "agent" ? "agent" : "project"];
}

function isConnected(tool: ToolDef, status: OnboardingStatus | null): boolean {
  if (tool.type === "llm") return !!status?.[tool.def.statusKey];
  if (tool.type === "service") return !!status?.[tool.def.id];
  return false;
}

/** The option the slot is currently using: the first connected, else the first. */
function chosenOption(slot: Slot, status: OnboardingStatus | null): ToolDef {
  return slot.options.find((o) => isConnected(o, status)) ?? slot.options[0];
}

/** Consecutive slots that share a section render as one group (one Section cell). */
function groupBySection(slots: Slot[]): Slot[][] {
  const groups: Slot[][] = [];
  for (const s of slots) {
    const last = groups[groups.length - 1];
    if (last && last[0].section === s.section) last.push(s);
    else groups.push([s]);
  }
  return groups;
}

/** Only slots with something to connect count toward progress. */
const wired = (slot: Slot) => slot.options.some((o) => o.type !== "placeholder");

/* ---------------- progress (drives every onboarding status in the UI) ---------------- */

export type OnboardingTone = "red" | "yellow" | "green";

export interface OnboardingProgress {
  tone: OnboardingTone;
  /** Short status words for the sidebar / home button. */
  label: string;
  connected: number;
  total: number;
}

/**
 * Where the owner is with onboarding, counted in JOBS: a job is done when any
 * one of its options is connected. The AI engine (Claude OR OpenAI) is required
 * and counts once; placeholder-only jobs don't count (nothing to connect yet).
 */
export function onboardingProgress(status: OnboardingStatus | null, kind?: string | null): OnboardingProgress | null {
  if (!status) return null;
  const llmOn = status.anthropic || status.openai;
  // Optional jobs never hold onboarding back.
  const slots = toolboxFor(kind).filter((s) => wired(s) && s.options[0].type !== "llm" && !OPTIONAL_JOBS.has(s.id));
  const total = 1 + slots.length;
  const connected = Number(llmOn) + slots.filter((s) => s.options.some((o) => isConnected(o, status))).length;
  if (!llmOn) return { tone: "red", label: "You need to do onboarding", connected, total };
  if (connected === total) return { tone: "green", label: "Onboarding complete", connected, total };
  const share = connected / total;
  const words = share >= 0.75 ? "Almost there" : share >= 0.5 ? "Halfway there" : "Getting started";
  return { tone: "yellow", label: `${words} · ${connected} of ${total}`, connected, total };
}

export const TONE_DOT: Record<OnboardingTone, string> = { red: "bg-bad", yellow: "bg-warn", green: "bg-ok" };
const TONE_TEXT: Record<OnboardingTone, string> = { red: "text-bad", yellow: "text-warn", green: "text-ok" };

/* ---------------- the table ---------------- */

function slotStatus(slot: Slot, status: OnboardingStatus | null): { text: string; tone: OnboardingTone | "muted" } {
  const chosen = chosenOption(slot, status);
  if (chosen.type === "placeholder") return { text: chosen.def.statusText ?? "Coming soon", tone: "muted" };
  if (chosen.type === "llm") {
    // Only one engine is needed: the one in use reads "Active"; the other is
    // optional once either is in, and required-ish ("Set one") until then.
    const active = (status?.activeLlm || "ai-anthropic") === chosen.def.id;
    if (isConnected(chosen, status)) return { text: active ? "Active" : "Connected", tone: "green" };
    return status?.anthropic || status?.openai ? { text: "Not needed", tone: "muted" } : { text: "Set one", tone: "red" };
  }
  if (isConnected(chosen, status)) return { text: "Connected", tone: "green" };
  return { text: "Not set", tone: "muted" };
}

/** The onboarding toolbox: section · tool (pick one where there's a choice) · status · Update. */
/** Status of one tool option: Active once connected (or the engine in use), else what's left to do. */
function optionStatus(o: ToolDef, status: OnboardingStatus | null): { text: string; tone: OnboardingTone | "muted" } {
  if (o.type === "placeholder") return { text: o.def.statusText ?? "Coming soon", tone: "muted" };
  if (o.type === "llm") {
    const active = (status?.activeLlm || "ai-anthropic") === o.def.id;
    if (isConnected(o, status)) return active ? { text: "Active", tone: "green" } : { text: "Connected", tone: "green" };
    return status?.anthropic || status?.openai ? { text: "Not needed", tone: "muted" } : { text: "Set one", tone: "red" };
  }
  return isConnected(o, status) ? { text: "Active", tone: "green" } : { text: "Not set", tone: "muted" };
}

/** One short, plain description per tool, shown from the ⓘ button. */
const TOOL_INFO: Record<string, string> = {
  "ai-anthropic": "Claude: the AI that runs every stage of the pipeline (questions, designs, code, reviews).",
  "ai-openai": "OpenAI: an alternative AI engine for the pipeline. You only need one engine.",
  langchain: "The framework your agent is built on: it runs the model, picks tools and follows the steps.",
  crewai: "A framework for teams of agents that hand work to each other. Not wired yet.",
  pydantic: "Checks the agent's answers and tool inputs have the right shape. Built into every agent.",
  langfuse: "Records every agent run step by step (model calls, tools, time, cost) so you can see what happened.",
  langgraph: "Pauses risky actions until you approve them. Built in.",
  "supabase-auth": "Login for agents people use for free, from the same Supabase account as the database.",
  clerk: "Login plus payments, for agents you charge people for.",
  "supabase-postgres": "Stores each agent's conversations, memory and actions waiting for approval.",
  neon: "Same job as Supabase Postgres, from a different provider.",
  aws: "Hosts your agent on Amazon Bedrock AgentCore using this computer's AWS sign-in. You pay only while it runs.",
  railway: "Hosts your agent on Railway. Simple setup, about $5/month.",
  vercel: "Hosts the chat page, for agents people talk to.",
  "github-actions": "Runs tests and evaluations automatically on every change, and checks for alerts hourly.",
  github: "Keeps each agent's code in a private GitHub repo. GitHub then tests every change and releases a test copy by itself; going live still needs your OK.",
  exa: "Searches forums and the web for real demand and competitors (Market Researcher).",
  google: "Makes brand images and screen designs (Gemini).",
  supabase: "Stores your landing page's waitlist signups.",
  resend: "Sends waitlist and launch emails.",
  posthog: "Measures visitors and signups on the pages you ship.",
};

function toolInfo(o: ToolDef): string {
  return TOOL_INFO[o.def.id] ?? (o.type === "placeholder" ? o.def.blurb : o.type === "service" ? o.def.unlocks : o.def.label);
}

/** ⓘ — hover (or tap on a phone) for a one-line explanation. */
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button
        type="button"
        aria-label="What is this?"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-edge text-[11px] font-semibold text-muted hover:border-accent hover:text-fg"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShow((v) => !v);
        }}
      >
        i
      </button>
      {show && (
        <span role="tooltip" className="absolute left-1/2 top-6 z-30 w-60 -translate-x-1/2 rounded-lg border border-edge bg-panel p-2.5 text-xs font-normal leading-relaxed text-fg shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

/** A tool row's dot: green = in use, yellow = connected or not needed, red = not set. */
function rowDot(text: string): OnboardingTone {
  return text === "Active" ? "green" : text === "Connected" || text === "Not needed" ? "yellow" : "red";
}

/** Summary for a section with nothing to connect here: "Set per agent", else "Built in", else "Coming soon". */
function sectionWord(opts: ToolDef[]): string {
  const words = opts.map((o) => (o.type === "placeholder" ? o.def.statusText : undefined));
  return words.find((w) => w && w !== "Built in" && w !== "No key needed") ?? (words.every(Boolean) ? "Built in" : "Coming soon");
}

/** Slots that do the same job (e.g. the two AI-engine lines) become one pick-one list. */
function mergeJobs(group: Slot[]): Slot[] {
  const out: Slot[] = [];
  for (const s of group) {
    const same = out.find((x) => x.label === s.label);
    if (same) same.options = [...same.options, ...s.options];
    else out.push({ ...s, options: [...s.options] });
  }
  return out;
}

/** One line per job, shown when its toggle opens. Optional jobs say so (and why). */
const JOB_INTRO: Record<string, string> = {
  "ai-anthropic": "The AI that does the work at every stage. Required: connect one.",
  tracing: "Optional. Records each run step by step so you can see what happened; everything works without it.",
  runtime: "Where your agent runs once it's live. Required to deploy.",
  github: "Required. Pushes every change to your agent to a private GitHub repo; GitHub then tests it and releases a test copy by itself.",
  "market-search": "Finds real demand and competitors for your idea.",
  images: "Makes your logo, brand images and screen designs.",
  waitlist: "Stores signups from your landing page.",
  email: "Sends waitlist and launch emails.",
  analytics: "Measures visitors and signups on the pages you ship.",
};
const OPTIONAL_JOBS = new Set(["tracing", "auth"]);

const isBuiltIn = (o: ToolDef) => o.type === "placeholder" && (o.def.statusText === "Built in" || o.def.statusText === "No key needed");
const isPerAgent = (o: ToolDef) => o.type === "placeholder" && o.def.statusText === "Set per agent";
const isLater = (o: ToolDef) => o.type === "placeholder" && !o.def.statusText;

export function OnboardingPanel({
  status,
  onChanged,
  kind,
}: {
  status: OnboardingStatus | null;
  onChanged: () => void;
  /** Which pipeline's toolbox to show. */
  kind?: string | null;
}) {
  const [editing, setEditing] = useState<{ slot: Slot; option: ToolDef } | null>(null);
  // The option the owner picked per job (before it's connected); defaults to the one in use.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const jobs = mergeJobs(toolboxFor(kind));
  // Each job is a plain toggle: the first starts open, the rest closed.
  const [openJobs, setOpenJobs] = useState<Set<string>>(() => new Set(jobs[0] ? [jobs[0].label] : []));
  const toggleJob = (label: string) =>
    setOpenJobs((cur) => {
      const next = new Set(cur);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  // 1) What you set up: jobs with a key to enter (and the per-agent ones, so nothing needed is hidden).
  const setup = jobs
    .map((j) => ({ ...j, options: j.options.filter((o) => o.type !== "placeholder" || isPerAgent(o)) }))
    .filter((j) => j.options.length);
  // 2) What already works: read-only.
  const builtIn = jobs.flatMap((j) => j.options.filter(isBuiltIn).map((o) => ({ job: j.label, o })));
  const later = jobs.flatMap((j) => j.options.filter(isLater).map((o) => shortName(o)));

  async function select(slot: Slot, o: ToolDef) {
    setPicked((p) => ({ ...p, [slot.label]: o.def.id }));
    // Picking a connected engine switches to it right away.
    if (o.type === "llm" && isConnected(o, status) && (status?.activeLlm || "ai-anthropic") !== o.def.id) {
      await activateLlm(o.def.id);
      onChanged();
    }
  }

  return (
    <>
      <h3 className="text-base font-semibold text-fg">Set up one tool per section, then build and deploy {kind === "agent" ? "agents" : "apps"} anytime.</h3>
      <div className="mt-3 divide-y divide-edge/60">
        {setup.map((slot) => {
          const chosen = slot.options.find((o) => o.def.id === picked[slot.label]) ?? (slot.options.find((o) => isConnected(o, status)) ?? slot.options[0]);
          const isOpen = openJobs.has(slot.label);
          const anyActive = slot.options.some((o) => optionStatus(o, status).text === "Active");
          const perAgentJob = slot.options.every(isPerAgent);
          const dot: OnboardingTone =
            perAgentJob || (OPTIONAL_JOBS.has(slot.id) && !anyActive) ? "yellow" : anyActive ? "green" : slot.options.some((o) => isConnected(o, status)) ? "yellow" : "red";
          return (
            <div key={slot.label} className="py-2.5">
              <button className="flex w-full items-center gap-2 text-left" onClick={() => toggleJob(slot.label)} aria-expanded={isOpen}>
                <span className={`text-[10px] text-muted transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>▶</span>
                <span className="text-[14px] font-semibold text-accent2">{slot.label}</span>
                {(() => {
                  const tags = [OPTIONAL_JOBS.has(slot.id) ? "optional" : slot.options.length > 1 ? "pick one" : "", perAgentJob ? "set per agent" : ""].filter(Boolean);
                  return tags.length ? <span className="text-xs text-muted">· {tags.join(", ")}</span> : null;
                })()}
                <span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${TONE_DOT[dot]}`} />
              </button>
              {isOpen && JOB_INTRO[slot.id] && <p className="mt-1.5 pl-5 text-xs text-muted">{JOB_INTRO[slot.id]}</p>}
              {isOpen && (
              <ul className="mt-2 space-y-1 pl-5" role="radiogroup" aria-label={slot.label}>
                {slot.options.map((o) => {
                  const on = o === chosen;
                  const perAgent = isPerAgent(o);
                  return (
                    <li key={o.def.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${on ? "border-accent/60 bg-accent/5" : "border-edge"}`}>
                      <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                        <input type="radio" name={slot.label} checked={on} onChange={() => select(slot, o)} />
                        <span className="truncate font-medium text-fg">{shortName(o)}</span>
                        {on && !perAgent && (
                          <button
                            className="btn-ghost ml-1 px-2 py-0.5 text-[11px]"
                            onClick={(e) => {
                              e.preventDefault();
                              setEditing({ slot, option: o });
                            }}
                          >
                            Update
                          </button>
                        )}
                      </label>
                      {/* Status lives on the toggle heading only. */}
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
          );
        })}
      </div>

      {builtIn.length > 0 && (
        <>
          <hr className="my-6 border-edge" />
          <h2 className="text-xl font-semibold text-fg">Already built in</h2>
          <ul className="mt-3 space-y-1.5">
            {builtIn.map(({ job, o }) => (
              <li key={o.def.id} className="flex items-center gap-2.5 text-sm">
                <span role="img" aria-label={`${shortName(o)} is built in`} className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-ok text-[11px] font-bold text-onbright">
                  ✓
                </span>
                <span className="font-medium text-fg">{shortName(o)}</span>
                <span className="text-xs text-muted">{job.replace(/\s*\(.*\)$/, "")}</span>
                <InfoTip text={toolInfo(o)} />
              </li>
            ))}
          </ul>
          {later.length > 0 && <p className="mt-4 text-xs text-muted">Coming later: {later.join(", ")}.</p>}
        </>
      )}

      {editing && (
        <UpdateDialog
          slot={editing.slot}
          initial={editing.option}
          status={status}
          onClose={() => setEditing(null)}
          onChanged={() => {
            onChanged();
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

/** The tool's name without the parenthetical ("Claude (Anthropic)" → "Claude"). */
function shortName(tool: ToolDef): string {
  return tool.def.label.replace(/\s*\(.*\)\s*$/, "");
}

/** Turns any web address in help text (e.g. us.cloud.langfuse.com) into a link that opens in a new tab. */
function Linkified({ text }: { text: string }) {
  const re = /(https?:\/\/[^\s),]+|\b(?:[a-z0-9-]+\.)+(?:com|ai|app|io|dev|net|org|co)(?:\/[^\s),]*)?)/gi;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const raw = m[0].replace(/[.)]+$/, "");
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    parts.push(
      <a key={at} href={href} target="_blank" rel="noopener noreferrer" className="text-accent2 underline hover:text-fg">
        {raw}
      </a>
    );
    last = at + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/* ---------------- the Update pop-up ---------------- */

/**
 * A narrow, focused pop-up for one job: choose the tool (when there's a choice),
 * paste its key, save. The how-to-get-this-key steps sit one tap away.
 */
function UpdateDialog({
  slot,
  initial,
  status,
  onClose,
  onChanged,
}: {
  slot: Slot;
  initial: ToolDef;
  status: OnboardingStatus | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const tool = initial;
  const fields: Field[] =
    tool.type === "service"
      ? tool.def.fields
      : tool.type === "llm"
        ? [{ name: "apiKey", label: `${tool.def.label} API key`, type: "password" }]
        : [];
  const [values, setValues] = useState<Record<string, string>>(() => (initial.type === "service" ? initialValues(initial.def) : {}));
  const [showHelp, setShowHelp] = useState(false);
  // Tools that can connect with a browser sign-in get Quick start (shown first) next to the key fields.
  const quick = tool.type === "service" && (tool.def.id === "aws" || tool.def.id === "github") ? (tool.def.id as "aws" | "github") : null;
  const [mode, setMode] = useState<"quick" | "manual">("quick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);


  const connected = isConnected(tool, status);
  const isActiveEngine = tool.type === "llm" && (status?.activeLlm || "ai-anthropic") === tool.def.id;
  const allFilled = fields.length > 0 && fields.every((f) => f.optional || (values[f.name] || "").trim());

  async function save() {
    setBusy(true);
    setError(null);
    let r: { ok: boolean; error?: string };
    if (tool.type === "llm") {
      r = await connectLlm(tool.def.id, (values.apiKey || "").trim());
      // Saving a key from this pop-up is choosing that engine.
      if (r.ok) await activateLlm(tool.def.id);
    } else if (tool.type === "service") {
      r = await connectService(tool.def.id, values);
    } else {
      r = { ok: false, error: "Nothing to connect yet." };
    }
    setBusy(false);
    if (!r.ok) return setError(r.error || "Connection failed.");
    onChanged();
  }

  async function switchTo() {
    if (tool.type !== "llm") return;
    await activateLlm(tool.def.id);
    onChanged();
  }

  const docs = tool.type === "placeholder" ? [] : tool.def.docs;
  const docsUrl = tool.type === "placeholder" ? "" : tool.def.docsUrl;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Update ${slot.label}`}
        className="card max-h-[90vh] w-full max-w-sm overflow-y-auto bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-fg">{shortName(tool)}</h3>
            <p className="mt-0.5 text-[11px] text-muted">{slot.section}</p>
          </div>
          <button className="text-sm text-muted hover:text-fg" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* The tool was already picked on the page, so the pop-up is only about that one tool. */}
        {tool.type === "placeholder" ? (
          <p className="mt-4 text-sm text-muted">
            <span className="font-medium text-fg">{tool.def.label}.</span> {tool.def.blurb}
            {!tool.def.statusText && " Not wired into the pipeline yet — see the agent release plan."}
          </p>
        ) : (
          <>
            {tool.type === "service" && <p className="mt-3 text-xs text-muted">{tool.def.unlocks}</p>}
            {quick && (
              <div className="mt-4 overflow-hidden rounded-xl border border-edge">
                <div className="grid grid-cols-2 divide-x divide-edge bg-ink/40 text-xs font-semibold">
                  {([["quick", "⚡ Quick start"], ["manual", "Traditional setup"]] as const).map(([id, label]) => (
                    <button
                      key={id}
                      className={`px-3 py-2 ${mode === id ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}
                      onClick={() => setMode(id)}
                      aria-pressed={mode === id}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {mode === "quick" && (
                  <div className="border-t border-edge p-3">
                    <QuickStart id={quick} onDone={onChanged} />
                  </div>
                )}
              </div>
            )}
            {(!quick || mode === "manual") && (
            <>
            <div className="mt-4 space-y-2">
              {fields.map((f, i) => (
                <input
                  key={`${tool.def.id}-${f.name}`}
                  autoFocus={i === 0}
                  className="input text-sm"
                  type={f.type || "text"}
                  placeholder={connected ? `${f.label} — saved; paste to replace` : f.label}
                  value={values[f.name] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && allFilled && !busy && save()}
                />
              ))}
            </div>
            {error && <p className="mt-2 text-xs text-bad">{error}</p>}
            <div className="mt-4 flex items-center justify-between gap-2">
              {tool.type === "llm" && connected && !isActiveEngine ? (
                <button className="btn-ghost text-xs" onClick={switchTo}>
                  Switch to {shortName(tool)}
                </button>
              ) : (
                <span />
              )}
              <button className="btn-primary text-sm" disabled={busy || !allFilled} onClick={save}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
            </>
            )}

            <div className="mt-4 border-t border-edge pt-3">
              <button
                className="text-xs font-medium text-accent2 hover:text-fg"
                onClick={() => setShowHelp((v) => !v)}
                aria-expanded={showHelp}
              >
                {showHelp ? "Hide help" : "Need help getting this key?"}
              </button>
              {showHelp && (
                <div className="mt-2">
                  <ol className="list-decimal space-y-1 pl-4 text-xs text-fg/85">
                    {docs.map((step, i) => (
                      <li key={i}>
                        <Linkified text={step} />
                      </li>
                    ))}
                  </ol>
                  <a
                    href={docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-accent2 hover:text-fg"
                  >
                    Open {new URL(docsUrl).host} ↗
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Quick start: sign in with the browser (AWS: aws login; GitHub: device sign-in), then poll until connected. */
function QuickStart({ id, onDone }: { id: "aws" | "github"; onDone: () => void }) {
  const [st, setSt] = useState<{ state: string; code?: string; url?: string; error?: string; needsUpdate?: boolean; command?: string; version?: string } | null>(null);
  const opened = useRef(false);

  async function start() {
    opened.current = false;
    const d = await fetch(`/api/quickstart/${id}`, { method: "POST" }).then((r) => r.json()).catch(() => ({ state: "failed", error: "Couldn't start." }));
    setSt(d);
  }
  useEffect(() => {
    if (st?.state !== "running") return;
    if (st.url && st.code && !opened.current) {
      opened.current = true;
      window.open(st.url, "_blank", "noopener");
    }
    const t = setInterval(async () => {
      const d = await fetch(`/api/quickstart/${id}`).then((r) => r.json()).catch(() => null);
      if (!d) return;
      setSt(d);
      if (d.state === "done") onDone();
    }, 2000);
    return () => clearInterval(t);
  }, [st?.state, st?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps =
    id === "aws"
      ? ["Click Sign in: your browser opens AWS.", "Sign in with your AWS account and approve.", "Come back here: AWS is connected."]
      : ["Click Sign in: a code appears and GitHub opens.", "Enter the code on GitHub and approve.", "Come back here: GitHub is connected."];

  return (
    <div className="space-y-3 text-xs">
      <ol className="list-decimal space-y-1 pl-4 text-fg/85">{steps.map((x) => <li key={x}>{x}</li>)}</ol>
      {st?.needsUpdate ? (
        <p className="text-warn">
          Your AWS CLI ({st.version}) is too old for browser sign-in. Update it, then try again:{" "}
          <code className="rounded bg-ink px-1 py-0.5 text-fg">{st.command}</code>
        </p>
      ) : st?.state === "running" ? (
        <div className="space-y-1">
          {st.code && (
            <p className="text-fg">
              Your code: <span className="rounded bg-ink px-2 py-1 font-mono text-sm font-semibold tracking-widest">{st.code}</span>{" "}
              {st.url && <a className="text-accent2 underline" href={st.url} target="_blank" rel="noopener noreferrer">open GitHub ↗</a>}
            </p>
          )}
          <p className="flex items-center gap-2 text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Waiting for you to finish signing in…</p>
        </div>
      ) : st?.state === "done" ? (
        <p className="text-ok">✓ Connected.</p>
      ) : (
        <>
          {st?.state === "failed" && <p className="text-bad">{st.error}</p>}
          <button className="btn-primary text-sm" onClick={start}>Sign in</button>
        </>
      )}
    </div>
  );
}

/* ---------------- modal (home button + the gate) ---------------- */

export function OnboardingModal({
  status,
  onClose,
  onChanged,
  kind,
}: {
  status: OnboardingStatus | null;
  onClose: () => void;
  onChanged: () => void;
  kind?: string | null;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div className="card w-full max-w-2xl bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-fg">Onboarding</h2>
          <button className="btn-ghost shrink-0 text-xs" onClick={onClose}>
            Close
          </button>
        </div>
        <OnboardingPanel status={status} onChanged={onChanged} kind={kind} />
      </div>
    </div>
  );
}

/* ---------------- top button ---------------- */

export function OnboardingButton({
  status,
  reload,
  highlight,
  className,
  kind,
}: {
  status: OnboardingStatus | null;
  reload: () => void;
  /** Pulse to draw the eye when the user is being gated. */
  highlight?: boolean;
  className?: string;
  kind?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const progress = onboardingProgress(status, kind);
  const tone = progress?.tone ?? "red";
  const cls = {
    green: "border-ok/40 bg-ok/10 text-ok hover:bg-ok/20",
    yellow: "border-warn/40 bg-warn/10 text-warn hover:bg-warn/20",
    red: "border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
  }[tone];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${cls} ${
          highlight && tone === "red" ? "ring-2 ring-bad/50 animate-pulse" : ""
        } ${className || ""}`}
      >
        <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
        {progress?.label ?? "Onboarding"}
      </button>
      {open && <OnboardingModal status={status} onClose={() => setOpen(false)} onChanged={reload} kind={kind} />}
    </>
  );
}

/* ---------------- gate panel (blocks a phase) ---------------- */

export function OnboardingGate({ reload, kind }: { reload: () => void; kind?: string | null }) {
  const { status, reload: reloadStatus } = useOnboarding();
  const [open, setOpen] = useState(false);

  function changed() {
    reloadStatus();
    reload();
  }

  return (
    <div className="card border border-bad/30 p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-bad/15 text-bad">🔑</div>
      <h3 className="mt-3 text-base font-semibold text-fg">Complete onboarding to continue</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        This stage needs an AI engine. Add your Claude or OpenAI key in the toolbox.
      </p>
      <button className="btn-primary mt-4" onClick={() => setOpen(true)}>
        Open toolbox →
      </button>
      {open && <OnboardingModal status={status} onClose={() => setOpen(false)} onChanged={changed} kind={kind} />}
    </div>
  );
}
