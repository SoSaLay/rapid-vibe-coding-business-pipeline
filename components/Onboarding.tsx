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
  required?: boolean;
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
    help: "Free key at resend.com → API Keys. Auth/billing emails stay with Clerk/Stripe.",
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

/* ---------------- one service row ---------------- */

function ServiceRow({
  service,
  connected,
  onConnected,
}: {
  service: Service;
  connected: boolean;
  onConnected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(service));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await connectService(service.id, values);
    setBusy(false);
    if (!r.ok) return setError(r.error || "Connection failed.");
    setOpen(false);
    setValues(initialValues(service));
    onConnected();
  }

  const allFilled = service.fields.every((f) => f.optional || (values[f.name] || "").trim());

  return (
    <div className="rounded-lg border border-edge bg-edge/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
              connected ? "bg-ok text-onbright" : "bg-bad/20 text-bad"
            }`}
          >
            {connected ? "✓" : "✕"}
          </span>
          <span className="text-sm font-medium text-fg">{service.label}</span>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            aria-label={`How to get a ${service.label} key`}
            aria-expanded={showHelp}
            title="How to get this key"
            className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold transition-colors ${
              showHelp ? "border-accent2 bg-accent2/15 text-accent2" : "border-edge text-muted hover:border-accent2 hover:text-accent2"
            }`}
          >
            i
          </button>
          {service.required ? (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">Required</span>
          ) : (
            <span className="rounded bg-edge px-1.5 py-0.5 text-[10px] text-muted">Optional</span>
          )}
        </div>
        <button className="btn-ghost text-[11px]" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : connected ? "Update" : "Connect"}
        </button>
      </div>
      <p className={`mt-1.5 text-[11px] ${service.required ? "text-muted" : "text-accent2"}`}>{service.unlocks}</p>

      {showHelp && (
        <div className="mt-2 rounded-lg border border-accent2/30 bg-accent2/5 p-3">
          <p className="mb-1.5 text-[11px] font-medium text-fg">How to get this key</p>
          <ol className="list-decimal space-y-1 pl-4 text-[11px] text-fg/85">
            {service.docs.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <a
            href={service.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[11px] font-medium text-accent2 hover:text-fg"
          >
            Open {new URL(service.docsUrl).host} ↗
          </a>
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted">{service.help}</p>
          {service.fields.map((f) => (
            <input
              key={f.name}
              className="input text-xs"
              type={f.type || "text"}
              placeholder={f.label}
              value={values[f.name] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          ))}
          {error && <p className="text-[11px] text-bad">{error}</p>}
          <button className="btn-primary text-xs" disabled={busy || !allFilled} onClick={submit}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- AI engine section (Claude / OpenAI) ---------------- */

function LlmRow({
  option,
  connected,
  isActive,
  onConnected,
  onActivate,
}: {
  option: LlmOption;
  connected: boolean;
  isActive: boolean;
  onConnected: () => void;
  onActivate: (id: LlmOption["id"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await connectLlm(option.id, apiKey.trim());
    setBusy(false);
    if (!r.ok) return setError(r.error || "Connection failed.");
    setOpen(false);
    setApiKey("");
    onConnected();
  }

  return (
    <div className="rounded-lg border border-edge bg-panel/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
              connected ? "bg-ok text-onbright" : "bg-bad/20 text-bad"
            }`}
          >
            {connected ? "✓" : "✕"}
          </span>
          <span className="text-sm font-medium text-fg">{option.label}</span>
          {option.recommended && (
            <span className="rounded bg-accent2/15 px-1.5 py-0.5 text-[10px] text-accent2">Default</span>
          )}
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            aria-label={`How to get a ${option.label} key`}
            aria-expanded={showHelp}
            title="How to get this key"
            className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold transition-colors ${
              showHelp ? "border-accent2 bg-accent2/15 text-accent2" : "border-edge text-muted hover:border-accent2 hover:text-accent2"
            }`}
          >
            i
          </button>
        </div>
        <div className="flex items-center gap-2">
          {connected &&
            (isActive ? (
              <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-medium text-ok">Active</span>
            ) : (
              <button className="btn-ghost text-[11px]" onClick={() => onActivate(option.id)}>
                Use this
              </button>
            ))}
          <button className="btn-ghost text-[11px]" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : connected ? "Update" : "Connect"}
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="mt-2 rounded-lg border border-accent2/30 bg-accent2/5 p-3">
          <p className="mb-1.5 text-[11px] font-medium text-fg">How to get this key</p>
          <ol className="list-decimal space-y-1 pl-4 text-[11px] text-fg/85">
            {option.docs.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <a
            href={option.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[11px] font-medium text-accent2 hover:text-fg"
          >
            Open {new URL(option.docsUrl).host} ↗
          </a>
        </div>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <input
            className="input text-xs"
            type="password"
            placeholder={`${option.label} API key`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          {error && <p className="text-[11px] text-bad">{error}</p>}
          <button className="btn-primary text-xs" disabled={busy || !apiKey.trim()} onClick={submit}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      )}
    </div>
  );
}

function LlmEngineSection({ status, onChanged }: { status: OnboardingStatus | null; onChanged: () => void }) {
  const anthropic = !!status?.anthropic;
  const openai = !!status?.openai;
  const active = status?.activeLlm || "ai-anthropic";

  async function activate(id: LlmOption["id"]) {
    await activateLlm(id);
    onChanged();
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-fg">AI engine</span>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">Required</span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        Powers every phase. <span className="text-fg/80">Claude is the default and recommended</span> — or run the whole
        pipeline on OpenAI/ChatGPT instead. You only need one; the pipeline uses the engine marked{" "}
        <span className="text-ok">Active</span>.
      </p>
      <div className="mt-3 space-y-2">
        {LLM_OPTIONS.map((opt) => (
          <LlmRow
            key={opt.id}
            option={opt}
            connected={opt.statusKey === "anthropic" ? anthropic : openai}
            isActive={active === opt.id}
            onConnected={onChanged}
            onActivate={activate}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------- reusable panel (used inline by the Onboarding page + the modal) ---------------- */

export function OnboardingPanel({
  status,
  onChanged,
}: {
  status: OnboardingStatus | null;
  onChanged: () => void;
}) {
  const connectedCount = status
    ? Number(status.anthropic || status.openai) +
      Number(status.exa) +
      Number(status.google) +
      Number(status.supabase) +
      Number(status.resend) +
      Number(status.posthog)
    : 0;

  return (
    <div>
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            status?.allComplete
              ? "bg-ok text-onbright"
              : status?.requiredComplete
                ? "bg-warn/20 text-warn"
                : "bg-bad/20 text-bad"
          }`}
        >
          {status?.allComplete
            ? "✓ Fully connected"
            : status?.requiredComplete
              ? "◐ Ready to use · optional keys left"
              : "✕ Required key missing"}
        </span>
        <span className="text-muted">{connectedCount}/7 services connected</span>
      </div>

      <div className="mt-4 space-y-2">
        <LlmEngineSection status={status} onChanged={onChanged} />
        {SERVICES.map((s) => (
          <ServiceRow key={s.id} service={s} connected={!!status?.[s.id]} onConnected={onChanged} />
        ))}
      </div>
    </div>
  );
}

/* ---------------- modal ---------------- */

export function OnboardingModal({
  status,
  onClose,
  onChanged,
}: {
  status: OnboardingStatus | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Complete onboarding</h2>
            <p className="mt-1 text-xs text-muted">
              Connect your keys once — they’re stored locally and reused across every idea and phase. An AI engine
              (Claude or OpenAI) is required to start; each optional service unlocks more of the pipeline.
            </p>
          </div>
          <button className="btn-ghost shrink-0 text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-3">
          <OnboardingPanel status={status} onChanged={onChanged} />
        </div>
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
}: {
  status: OnboardingStatus | null;
  reload: () => void;
  /** Pulse to draw the eye when the user is being gated. */
  highlight?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Three states: all in (green ✓) · required-only (amber ◐) · required missing (red ✕).
  const state: "complete" | "partial" | "incomplete" = status?.allComplete
    ? "complete"
    : status?.requiredComplete
      ? "partial"
      : "incomplete";
  const tone = {
    complete: { cls: "border-ok/40 bg-ok/10 text-ok hover:bg-ok/20", icon: "✓" },
    partial: { cls: "border-warn/40 bg-warn/10 text-warn hover:bg-warn/20", icon: "◐" },
    incomplete: { cls: "border-bad/40 bg-bad/10 text-bad hover:bg-bad/20", icon: "✕" },
  }[state];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${tone.cls} ${
          highlight && state === "incomplete" ? "ring-2 ring-bad/50 animate-pulse" : ""
        } ${className || ""}`}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/0 text-[11px]">
          {tone.icon}
        </span>
        Complete onboarding
      </button>
      {open && (
        <OnboardingModal
          status={status}
          onClose={() => setOpen(false)}
          onChanged={reload}
        />
      )}
    </>
  );
}

/* ---------------- gate panel (blocks a phase) ---------------- */

export function OnboardingGate({ reload }: { reload: () => void }) {
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
        Capturing ideas is free, but moving into the Product Owner phase needs an AI engine connected. Add your Claude or
        OpenAI key (and any optional services) to unlock the rest of the pipeline.
      </p>
      <button className="btn-primary mt-4" onClick={() => setOpen(true)}>
        Complete onboarding →
      </button>
      {open && <OnboardingModal status={status} onClose={() => setOpen(false)} onChanged={changed} />}
    </div>
  );
}
