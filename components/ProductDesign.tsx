"use client";

import { useEffect, useState } from "react";
import { EngineSelector } from "./EngineSelector";

interface ScreenStates {
  empty: string;
  loading: string;
  error: string;
  success: string;
}

interface Screen {
  id: string;
  name: string;
  purpose: string;
  primary_action: string;
  key_elements: string[];
  states: ScreenStates;
  responsive_notes: string;
  is_key_screen: boolean;
}

interface Brief {
  branding: {
    name: string;
    name_rationale: string;
    tagline: string;
    personality: string[];
    voice: string;
    logo_direction: string;
  };
  ux: {
    target_user_summary: string;
    core_jobs: string[];
    information_architecture: string;
    screens: Screen[];
    flows: { name: string; steps: string[] }[];
  };
  visual: {
    mood: string;
    mode: string;
    style: string;
    colors: { name: string; hex: string; usage: string }[];
    typography: { heading_font: string; body_font: string; type_scale: string };
    spacing_and_shape: { spacing_scale: string; radius: string; elevation: string };
  };
  components: { name: string; description: string; used_on: string[] }[];
  dos_and_donts: { dos: string[]; donts: string[] };
  open_risks: string[];
}

interface Direction {
  system_ids: string[];
  rationale: string;
}

export function ProductDesign({
  projectId,
  hasSpec,
  brief,
  direction,
  mockups,
  mockupEngines,
  logo,
  approved,
  onUpdated,
}: {
  projectId: string;
  hasSpec: boolean;
  brief: Brief | null;
  direction: Direction | null;
  mockups: Record<string, string> | null;
  mockupEngines: Record<string, string> | null;
  logo: { file: string; at: string } | null;
  approved: boolean;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [inheritedLogo, setInheritedLogo] = useState<{ file: string; at: string } | null>(null);

  useEffect(() => {
    fetch("/api/google")
      .then((r) => r.json())
      .then((d) => setGoogleReady(!!d.configured))
      .catch(() => setGoogleReady(false));
    // Forward-inherit: if Pre-Marketing already made a logo, show it until this phase regenerates.
    if (!logo) {
      fetch(`/api/projects/${projectId}/assets?kind=logo`)
        .then((r) => r.json())
        .then((d) => {
          const list = d.assets || [];
          const last = list[list.length - 1];
          if (last) setInheritedLogo({ file: last.file, at: last.createdAt });
        })
        .catch(() => {});
    }
  }, [projectId, logo]);

  const effectiveLogo = logo ?? inheritedLogo;

  async function post(path: string, body?: any) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/${path}`, {
      method: "POST",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(d.error || "Request failed.");
      return false;
    }
    onUpdated();
    return true;
  }

  if (!hasSpec) return <div className="card p-6 text-sm text-muted">Locked until the product spec is complete.</div>;

  if (!brief) {
    return (
      <div className="card p-6 space-y-4">
        <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
          <p className="text-xs text-warn">
            <span className="font-semibold">Optional step.</span> Product Design produces the design spec the build
            phase works from — branding, screens with all their states, exact design tokens, and HTML mockups. Skip it
            and Phase 6 will improvise the design.
          </p>
        </div>
        <p className="text-sm text-muted text-center">
          Picks 1–2 reference design systems that fit your product, then generates the full design spec constrained by
          proven UI/UX rules.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button className="btn-ghost" disabled={busy} onClick={() => post("skip", { phase: "product-design" })}>
            Skip
          </button>
          <button className="btn-primary" disabled={busy} onClick={() => post("product-design/generate-brief")}>
            {busy ? "Designing… (this takes a minute)" : "Generate design spec"}
          </button>
        </div>
        {error && <p className="text-sm text-bad text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approved && (
        <div className="card p-4 border border-ok/30">
          <span className="rounded-full bg-ok px-3 py-1 text-sm font-semibold text-onbright">design-spec saved</span>
          <span className="ml-3 text-xs text-muted">Phase complete — Engineering unlocked.</span>
        </div>
      )}

      <BrandingCard
        brief={brief}
        busy={busy}
        onRegen={() => post("product-design/generate-brief")}
        projectId={projectId}
        logo={effectiveLogo}
        googleReady={googleReady}
        onLogo={() => post("product-design/logo")}
      />
      {direction && (
        <Section title="Design direction">
          <p className="text-sm text-fg/90">
            Reference system{direction.system_ids.length > 1 ? "s" : ""}:{" "}
            <span className="text-accent2">{direction.system_ids.join(", ")}</span>
          </p>
          <p className="mt-1 text-xs text-muted">{direction.rationale}</p>
        </Section>
      )}
      <VisualCard visual={brief.visual} />
      <UxCard ux={brief.ux} />
      <MockupPanel
        projectId={projectId}
        screens={brief.ux.screens}
        mockups={mockups}
        mockupEngines={mockupEngines}
        busy={busy}
        post={post}
      />
      <ComponentsCard components={brief.components} />
      <DosDontsCard d={brief.dos_and_donts} />
      {brief.open_risks.length > 0 && (
        <Section title="Open design risks — eyeball before building">
          <ul className="list-disc ml-5 space-y-0.5 text-sm text-warn/90">
            {brief.open_risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {!approved && (
        <div className="card p-5 text-center space-y-2">
          <p className="text-xs text-muted">
            Happy with the design? Approving saves the design-spec artifact and unlocks Engineering.
          </p>
          <button className="btn-primary" disabled={busy} onClick={() => post("product-design/approve")}>
            {busy ? "Saving…" : "Approve design → unlock Build"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-muted">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function BrandingCard({
  brief,
  busy,
  onRegen,
  projectId,
  logo,
  googleReady,
  onLogo,
}: {
  brief: Brief;
  busy: boolean;
  onRegen: () => void;
  projectId: string;
  logo: { file: string; at: string } | null;
  googleReady: boolean;
  onLogo: () => void;
}) {
  const b = brief.branding;
  const logoUrl = logo ? `/api/projects/${projectId}/assets?file=${logo.file}` : null;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-ok">Design spec</div>
        <button className="btn-ghost" disabled={busy} onClick={onRegen}>
          {busy ? "…" : "Regenerate"}
        </button>
      </div>

      <div className="mt-2 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl font-semibold text-fg">{b.name}</h3>
          <p className="text-sm text-muted">{b.tagline}</p>
        </div>
        <div className="shrink-0 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${b.name} logo`}
              className="h-20 w-20 rounded-lg border border-edge object-contain bg-ink/40"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-edge text-[10px] text-muted">
              no logo
            </div>
          )}
          {googleReady ? (
            <button className="btn-ghost mt-1.5 text-[11px]" disabled={busy} onClick={onLogo}>
              {busy ? "…" : logo ? "Regenerate" : "Generate logo"}
            </button>
          ) : (
            <p className="mt-1.5 max-w-[5rem] text-[10px] leading-tight text-muted">Connect Google below for a logo</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {b.personality.map((p) => (
          <span key={p} className="rounded-full border border-edge px-2.5 py-0.5 text-[11px] text-fg/80">
            {p}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        <span className="text-fg/70">Voice:</span> {b.voice}
      </p>
      <p className="mt-1 text-xs text-muted">
        <span className="text-fg/70">Logo direction:</span> {b.logo_direction}
      </p>
      <p className="mt-1 text-[11px] text-muted italic">{b.name_rationale}</p>
    </div>
  );
}

function VisualCard({ visual }: { visual: Brief["visual"] }) {
  return (
    <Section title="Visual direction & tokens">
      <p className="text-sm text-fg/90">
        {visual.style} · {visual.mode} mode · mood: <span className="text-accent2">{visual.mood}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visual.colors.map((c) => (
          <div key={c.name} className="flex items-center gap-2 rounded-lg border border-edge p-2">
            <span className="h-7 w-7 shrink-0 rounded border border-fg/20" style={{ backgroundColor: c.hex }} />
            <div className="min-w-0">
              <div className="truncate text-xs text-fg">{c.name}</div>
              <div className="text-[10px] text-muted">{c.hex}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
        <p>
          <span className="text-fg/70">Type:</span> {visual.typography.heading_font} /{" "}
          {visual.typography.body_font} · scale {visual.typography.type_scale}
        </p>
        <p>
          <span className="text-fg/70">Shape:</span> {visual.spacing_and_shape.spacing_scale} ·{" "}
          {visual.spacing_and_shape.radius} · {visual.spacing_and_shape.elevation}
        </p>
      </div>
    </Section>
  );
}

function UxCard({ ux }: { ux: Brief["ux"] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section title="UX — screens & flows">
      <p className="text-xs text-muted">{ux.target_user_summary}</p>
      <ul className="mt-2 list-disc ml-5 text-xs text-fg/80 space-y-0.5">
        {ux.core_jobs.map((j, i) => (
          <li key={i}>{j}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        <span className="text-fg/70">Architecture:</span> {ux.information_architecture}
      </p>

      <div className="mt-3 space-y-2">
        {ux.screens.map((s) => {
          const isOpen = open === s.id;
          return (
            <div key={s.id} className="rounded-lg border border-edge overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-edge/30 transition-colors"
                onClick={() => setOpen(isOpen ? null : s.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-fg truncate">{s.name}</span>
                  {s.is_key_screen && <span className="text-[10px] text-accent2 shrink-0">★ key</span>}
                </div>
                <span className="text-muted text-xs shrink-0">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 space-y-2 border-t border-edge text-xs">
                  <p className="text-fg/80">{s.purpose}</p>
                  <p className="text-muted">
                    <span className="text-fg/70">Primary action:</span> {s.primary_action}
                  </p>
                  <p className="text-muted">
                    <span className="text-fg/70">Elements:</span> {s.key_elements.join(" · ")}
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {(["empty", "loading", "error", "success"] as const).map((k) => (
                      <div key={k} className="rounded bg-ink/60 px-2.5 py-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-accent2">{k}</span>
                        <p className="text-fg/80">{s.states[k]}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-muted">
                    <span className="text-fg/70">Responsive:</span> {s.responsive_notes}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ux.flows.length > 0 && (
        <div className="mt-3 space-y-2">
          {ux.flows.map((f, i) => (
            <div key={i} className="rounded-lg bg-edge/30 p-3">
              <div className="text-xs font-medium text-fg">{f.name}</div>
              <p className="mt-1 text-[11px] text-muted">{f.steps.join(" → ")}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function StitchConnect() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/google")
      .then((r) => r.json())
      .then((d) => setReady(!!d.configured))
      .catch(() => setReady(false));
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/google/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!d.ok) return setError(d.error || "Failed to connect Google AI.");
    setReady(true);
    setOpen(false);
  }

  if (ready === null) return null;

  if (ready) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-accent2/30 bg-accent2/5 px-3 py-2">
        <span className="text-[11px] font-semibold text-accent2">✦ Stitch-mode on</span>
        <span className="text-[11px] text-muted">New mockups generate via Gemini.</span>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-edge bg-edge/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          <span className="text-fg/80 font-medium">Unlock Stitch-mode.</span> Connect Google (Gemini) to generate
          screens via Stitch-style AI instead of Claude HTML. Get a free key at aistudio.google.com → API keys.
        </p>
        <button className="btn-ghost shrink-0" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Connect"}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            type="password"
            placeholder="Google AI (Gemini) API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button className="btn-primary shrink-0" disabled={busy || !apiKey} onClick={connect}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

const ENGINE_LABEL: Record<string, string> = {
  "google-stitch": "Stitch",
  "claude-html": "Claude",
};

function MockupPanel({
  projectId,
  screens,
  mockups,
  mockupEngines,
  busy,
  post,
}: {
  projectId: string;
  screens: Screen[];
  mockups: Record<string, string> | null;
  mockupEngines: Record<string, string> | null;
  busy: boolean;
  post: (path: string, body?: any) => Promise<boolean>;
}) {
  const keyScreens = screens.filter((s) => s.is_key_screen).slice(0, 4);
  const done = mockups || {};
  const engines = mockupEngines || {};
  const previewUrl = (id: string) => `/api/projects/${projectId}/product-design/preview?screen=${id}`;

  return (
    <Section title="HTML mockups — key screens">
      <p className="text-xs text-muted mb-3">
        High-fidelity, animated previews built from the tokens above — purposeful motion (scroll reveals, hover, subtle
        WebGL where it fits), reduced-motion aware. Open them in a browser, regenerate any screen, or download the HTML.
      </p>
      <div className="mb-3">
        <EngineSelector projectId={projectId} />
      </div>
      <StitchConnect />
      <div className="space-y-2">
        {keyScreens.map((s) => {
          const ready = !!done[s.id];
          const engineLabel = ENGINE_LABEL[engines[s.id]] || null;
          return (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-fg">
                {s.name}
                {ready && engineLabel && (
                  <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] text-muted">
                    {engineLabel}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {ready && (
                  <>
                    <a className="btn-ghost" href={previewUrl(s.id)} target="_blank" rel="noreferrer">
                      Preview ↗
                    </a>
                    <a className="btn-ghost" href={`${previewUrl(s.id)}&download=1`}>
                      Download
                    </a>
                  </>
                )}
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => post("product-design/mockups", { screenId: s.id })}
                >
                  {busy ? "…" : ready ? "Regenerate" : "Generate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {keyScreens.some((s) => !done[s.id]) && (
        <button className="btn-primary mt-3" disabled={busy} onClick={() => post("product-design/mockups")}>
          {busy ? "Generating… (one call per screen)" : "Generate all key screens"}
        </button>
      )}
    </Section>
  );
}

function ComponentsCard({ components }: { components: Brief["components"] }) {
  return (
    <Section title="Component inventory">
      <div className="space-y-1.5">
        {components.map((c, i) => (
          <div key={i} className="rounded-lg bg-edge/30 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg">{c.name}</span>
              <span className="text-[10px] text-muted shrink-0">{c.used_on.join(", ")}</span>
            </div>
            <p className="text-[11px] text-muted">{c.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function DosDontsCard({ d }: { d: Brief["dos_and_donts"] }) {
  return (
    <Section title="Do's & don'ts — read by the build agent">
      <div className="grid gap-3 sm:grid-cols-2">
        <ul className="space-y-1 text-xs text-fg/85">
          {d.dos.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ok shrink-0">✓</span>
              {x}
            </li>
          ))}
        </ul>
        <ul className="space-y-1 text-xs text-fg/85">
          {d.donts.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-bad shrink-0">✕</span>
              {x}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
