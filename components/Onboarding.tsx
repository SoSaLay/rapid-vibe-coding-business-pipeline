"use client";

import { useCallback, useEffect, useState } from "react";

/* ---------------- status hook ---------------- */

export interface OnboardingStatus {
  anthropic: boolean;
  exa: boolean;
  google: boolean;
  supabase: boolean;
  github: boolean;
  /** LLM engine connected — gates pipeline progression. */
  requiredComplete: boolean;
  /** Every service connected — drives the "complete" (green) button state. */
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
}
interface Service {
  id: keyof Omit<OnboardingStatus, "requiredComplete" | "allComplete">;
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
    id: "anthropic",
    label: "Claude (Anthropic)",
    required: true,
    unlocks: "The AI engine behind every phase — the pipeline can't run without it.",
    help: "Get a key at console.anthropic.com → Settings → API Keys. Stored locally, reused everywhere.",
    docsUrl: "https://console.anthropic.com/settings/keys",
    docs: [
      "Sign in at console.anthropic.com (create an account if you don't have one).",
      "Add a payment method under Billing — a card on file is required before any key works.",
      "Go to Settings → API Keys (console.anthropic.com/settings/keys).",
      "Click “Create Key”, give it a name, then “Create Key”.",
      "Copy the key (starts with sk-ant-) — it's shown only once — and paste it below.",
    ],
    fields: [{ name: "apiKey", label: "Anthropic API key", type: "password" }],
  },
  {
    id: "exa",
    label: "Exa (market search)",
    unlocks: "Unlocks Market Research — live demand & competitor signal for your idea.",
    help: "Free key at dashboard.exa.ai → API Keys.",
    docsUrl: "https://dashboard.exa.ai/api-keys",
    docs: [
      "Sign in at dashboard.exa.ai (free to start).",
      "Open “API Keys” in the left menu (dashboard.exa.ai/api-keys).",
      "Click “+ Create new key” and give it a reference name.",
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
      "Click “Get API key” in the left sidebar (aistudio.google.com/app/apikey).",
      "Click “Create API key” → “Create API key in new project”.",
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
      "Create a free project at supabase.com (New project).",
      "Project URL: Settings → API (or the green “Connect” button) — looks like https://xxxx.supabase.co.",
      "Keys: Settings → API Keys → open the “Legacy API Keys” tab (this app uses the anon + service_role keys).",
      "Copy the anon (public) key and the service_role key — keep service_role secret, server-side only.",
      "Paste the URL and both keys below.",
    ],
    fields: [
      { name: "url", label: "Project URL (https://xxxx.supabase.co)" },
      { name: "anonKey", label: "anon public key", type: "password" },
      { name: "serviceKey", label: "service_role key", type: "password" },
    ],
  },
  {
    id: "github",
    label: "GitHub (import repos)",
    unlocks: "Unlocks importing PRIVATE repos in Business Owner. Public repos work without it.",
    help: "Fine-grained token at github.com → Settings → Developer settings → Fine-grained tokens.",
    docsUrl: "https://github.com/settings/personal-access-tokens/new",
    docs: [
      "Only needed for private repos — public repos import with no token.",
      "Go to github.com → Settings → Developer settings → Fine-grained tokens → “Generate new token”.",
      "Pick the Resource owner and the repositories you'll import (or “All repositories”).",
      "Under Repository permissions, set Contents → Read-only (Metadata is included automatically).",
      "Click “Generate token”, copy it (shown once: github_pat_… or ghp_…), and paste it below.",
    ],
    fields: [{ name: "token", label: "GitHub token (github_pat_… / ghp_…)", type: "password" }],
  },
];

async function connectService(id: Service["id"], values: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  let endpoint = "";
  let payload: Record<string, any> = {};
  if (id === "anthropic") {
    endpoint = "/api/ai/configure";
    payload = { provider: "ai-anthropic", credentials: { apiKey: values.apiKey } };
  } else if (id === "exa") {
    endpoint = "/api/exa/configure";
    payload = { apiKey: values.apiKey };
  } else if (id === "google") {
    endpoint = "/api/google/configure";
    payload = { apiKey: values.apiKey };
  } else if (id === "github") {
    endpoint = "/api/github/configure";
    payload = { token: values.token };
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
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await connectService(service.id, values);
    setBusy(false);
    if (!r.ok) return setError(r.error || "Connection failed.");
    setOpen(false);
    setValues({});
    onConnected();
  }

  const allFilled = service.fields.every((f) => (values[f.name] || "").trim());

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
  const connectedCount = status
    ? Number(status.anthropic) + Number(status.exa) + Number(status.google) + Number(status.supabase) + Number(status.github)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg bg-paper p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Complete onboarding</h2>
            <p className="mt-1 text-xs text-muted">
              Connect your keys once — they’re stored locally and reused across every idea and phase. Only Claude is
              required to start; each optional service unlocks more of the pipeline.
            </p>
          </div>
          <button className="btn-ghost shrink-0 text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[11px]">
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
          <span className="text-muted">{connectedCount}/5 services connected</span>
        </div>

        <div className="mt-4 space-y-2">
          {SERVICES.map((s) => (
            <ServiceRow
              key={s.id}
              service={s}
              connected={!!status?.[s.id]}
              onConnected={onChanged}
            />
          ))}
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
        Capturing ideas is free, but moving into the Product Owner phase needs the AI engine connected. Add your Claude
        key (and any optional services) to unlock the rest of the pipeline.
      </p>
      <button className="btn-primary mt-4" onClick={() => setOpen(true)}>
        Complete onboarding →
      </button>
      {open && <OnboardingModal status={status} onClose={() => setOpen(false)} onChanged={changed} />}
    </div>
  );
}
