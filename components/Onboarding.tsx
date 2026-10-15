"use client";

import { useCallback, useEffect, useState } from "react";

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
  id: "exa" | "google" | "supabase" | "resend" | "posthog";
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

const LANGSMITH: PlaceholderTool = {
  id: "langsmith",
  label: "LangSmith",
  blurb: "One key covers tracing, auth, evaluation, deployment and monitoring.",
};

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
    ...AI_ENGINES,
    {
      id: "framework",
      label: "Agent framework",
      section: "Agent Design · Engineering & Development",
      options: [placeholder({ id: "langchain", label: "LangChain", blurb: "Model and tool integrations, plus create_agent — the loop with structured responses.", statusText: "No key needed" })],
    },
    {
      id: "tracing",
      label: "Tracing & monitoring",
      section: "Engineering & Development · Operations",
      options: [placeholder(LANGSMITH)],
    },
    {
      id: "approval",
      label: "Human approval",
      section: "Security",
      options: [placeholder({ id: "langgraph", label: "LangGraph", blurb: "Interrupts pause consequential actions until a human approves.", statusText: "No key needed" })],
    },
    { id: "auth", label: "Authorization", section: "Security", options: [placeholder(LANGSMITH)] },
    {
      id: "unit-tests",
      label: "Unit tests",
      section: "Evaluations",
      options: [placeholder({ id: "pytest", label: "pytest", blurb: "Deterministic unit and integration tests for the agent's code and tools.", statusText: "No key needed" })],
    },
    { id: "evals", label: "Eval runner", section: "Evaluations", options: [placeholder(LANGSMITH)] },
    { id: "runtime", label: "Runtime host", section: "Deployment", options: [placeholder(LANGSMITH)] },
    {
      id: "chat-ui",
      label: "Chat UI",
      section: "Deployment",
      options: [
        placeholder({
          id: "agent-chat-ui",
          label: "Agent Chat UI",
          blurb: "Ready-made streaming chat frontend. Production needs a secured proxy or custom auth — never a browser-exposed LangSmith key.",
          statusText: "No key needed",
        }),
      ],
    },
    { id: "web-host", label: "Web host", section: "Deployment", options: [placeholder({ id: "vercel", label: "Vercel", blurb: "Hosts the chat web app." })] },
    {
      id: "ci",
      label: "CI / release gates",
      section: "Deployment",
      options: [placeholder({ id: "github-actions", label: "GitHub Actions", blurb: "Tests and offline evals on every pull request, preview deploys, and approval-gated promotion." })],
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
  const slots = toolboxFor(kind).filter((s) => wired(s) && s.options[0].type !== "llm");
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
  const slots = toolboxFor(kind);

  // Picking a connected engine switches to it right here; picking one that
  // isn't connected yet opens its key pop-up.
  async function pick(slot: Slot, option: ToolDef) {
    if (option.type === "llm" && isConnected(option, status)) {
      await activateLlm(option.def.id);
      onChanged();
    } else {
      setEditing({ slot, option });
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-edge">
        <table className="w-full text-left text-sm">
          <thead className="bg-edge/30 text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Section</th>
              <th className="px-4 py-2.5 font-medium">Tool</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          {/* One <tbody> per section: the Section cell spans that section's tools. */}
          {groupBySection(slots).map((group) => (
            <tbody key={group[0].section} className="border-t border-edge first-of-type:border-t-0">
              {group.map((slot, idx) => {
                const st = slotStatus(slot, status);
                const chosen = chosenOption(slot, status);
                const dot = <span className={`h-2 w-2 shrink-0 rounded-full ${st.tone === "muted" ? "bg-edge" : TONE_DOT[st.tone]}`} />;
                return (
                  <tr key={slot.id} className={idx > 0 ? "border-t border-edge/50" : ""}>
                    {idx === 0 && (
                      <td rowSpan={group.length} className="hidden px-4 py-3 align-top font-medium text-fg sm:table-cell">
                        {/* One section per line when a tool serves several. */}
                        {slot.section.split(" · ").map((name) => (
                          <div key={name} className="whitespace-nowrap">{name}</div>
                        ))}
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2">
                        {/* On a phone the Status column folds into this dot. */}
                        <span className="mt-1.5 sm:hidden">{dot}</span>
                        <div>
                          {slot.options.length > 1 ? (
                            <div className="inline-flex rounded-lg border border-edge p-0.5" role="radiogroup" aria-label={`${slot.label}: pick one`}>
                              {slot.options.map((o) => {
                                const on = o === chosen;
                                return (
                                  <button
                                    key={o.def.id}
                                    role="radio"
                                    aria-checked={on}
                                    onClick={() => pick(slot, o)}
                                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                      on ? "bg-accent text-white" : "text-muted hover:text-fg"
                                    }`}
                                  >
                                    {shortName(o)}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="font-medium text-fg">{shortName(chosen)}</div>
                          )}
                          <div className="mt-1 text-[11px] text-muted">
                            <span className="sm:hidden">{slot.section} · </span>
                            {slot.label}
                            {slot.options.length > 1 && <span className="text-accent2"> · pick one</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 align-top sm:table-cell">
                      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${st.tone === "muted" ? "text-muted" : TONE_TEXT[st.tone]}`}>
                        {dot}
                        {st.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <button className="btn-ghost text-xs" onClick={() => setEditing({ slot, option: chosen })}>
                        Update
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
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
  const [tool, setTool] = useState<ToolDef>(initial);
  const fields: Field[] =
    tool.type === "service"
      ? tool.def.fields
      : tool.type === "llm"
        ? [{ name: "apiKey", label: `${tool.def.label} API key`, type: "password" }]
        : [];
  const [values, setValues] = useState<Record<string, string>>(() => (initial.type === "service" ? initialValues(initial.def) : {}));
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function choose(o: ToolDef) {
    setTool(o);
    setValues(o.type === "service" ? initialValues(o.def) : {});
    setError(null);
    setShowHelp(false);
  }

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
            <h3 className="text-base font-semibold text-fg">{slot.label}</h3>
            <p className="mt-0.5 text-[11px] text-muted">{slot.section}</p>
          </div>
          <button className="text-sm text-muted hover:text-fg" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {slot.options.length > 1 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Choose one</div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${slot.label}: choose one`}>
              {slot.options.map((o) => {
                const on = o === tool;
                return (
                  <button
                    key={o.def.id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(o)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      on ? "border-accent bg-accent/10 text-fg" : "border-edge text-muted hover:border-accent/50 hover:text-fg"
                    }`}
                  >
                    <span className="block font-medium">{shortName(o)}</span>
                    <span className={`block text-[11px] ${isConnected(o, status) ? "text-ok" : "text-muted"}`}>
                      {isConnected(o, status) ? "Connected" : "Not set"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tool.type === "placeholder" ? (
          <p className="mt-4 text-sm text-muted">
            <span className="font-medium text-fg">{tool.def.label}.</span> {tool.def.blurb} Not wired into the pipeline yet — see the
            agent release plan.
          </p>
        ) : (
          <>
            {tool.type === "service" && <p className="mt-3 text-xs text-muted">{tool.def.unlocks}</p>}
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
                      <li key={i}>{step}</li>
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
          <h2 className="text-base font-semibold text-fg">Set up one tool per section, and the whole pipeline runs smoothly.</h2>
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
