"use client";

import { useState } from "react";

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
  approved,
  onUpdated,
}: {
  projectId: string;
  hasSpec: boolean;
  brief: Brief | null;
  direction: Direction | null;
  mockups: Record<string, string> | null;
  approved: boolean;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <span className="rounded-full bg-ok px-3 py-1 text-sm font-semibold text-ink">design-spec saved</span>
          <span className="ml-3 text-xs text-muted">Phase complete — Engineering unlocked.</span>
        </div>
      )}

      <BrandingCard brief={brief} busy={busy} onRegen={() => post("product-design/generate-brief")} />
      {direction && (
        <Section title="Design direction">
          <p className="text-sm text-white/90">
            Reference system{direction.system_ids.length > 1 ? "s" : ""}:{" "}
            <span className="text-accent2">{direction.system_ids.join(", ")}</span>
          </p>
          <p className="mt-1 text-xs text-muted">{direction.rationale}</p>
        </Section>
      )}
      <VisualCard visual={brief.visual} />
      <UxCard ux={brief.ux} />
      <MockupPanel projectId={projectId} screens={brief.ux.screens} mockups={mockups} busy={busy} post={post} />
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

function BrandingCard({ brief, busy, onRegen }: { brief: Brief; busy: boolean; onRegen: () => void }) {
  const b = brief.branding;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-ok">Design spec</div>
        <button className="btn-ghost" disabled={busy} onClick={onRegen}>
          {busy ? "…" : "Regenerate"}
        </button>
      </div>
      <h3 className="mt-2 text-2xl font-semibold text-white">{b.name}</h3>
      <p className="text-sm text-muted">{b.tagline}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {b.personality.map((p) => (
          <span key={p} className="rounded-full border border-edge px-2.5 py-0.5 text-[11px] text-white/80">
            {p}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        <span className="text-white/70">Voice:</span> {b.voice}
      </p>
      <p className="mt-1 text-xs text-muted">
        <span className="text-white/70">Logo direction:</span> {b.logo_direction}
      </p>
      <p className="mt-1 text-[11px] text-muted italic">{b.name_rationale}</p>
    </div>
  );
}

function VisualCard({ visual }: { visual: Brief["visual"] }) {
  return (
    <Section title="Visual direction & tokens">
      <p className="text-sm text-white/90">
        {visual.style} · {visual.mode} mode · mood: <span className="text-accent2">{visual.mood}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visual.colors.map((c) => (
          <div key={c.name} className="flex items-center gap-2 rounded-lg border border-edge p-2">
            <span className="h-7 w-7 shrink-0 rounded border border-white/20" style={{ backgroundColor: c.hex }} />
            <div className="min-w-0">
              <div className="truncate text-xs text-white">{c.name}</div>
              <div className="text-[10px] text-muted">{c.hex}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
        <p>
          <span className="text-white/70">Type:</span> {visual.typography.heading_font} /{" "}
          {visual.typography.body_font} · scale {visual.typography.type_scale}
        </p>
        <p>
          <span className="text-white/70">Shape:</span> {visual.spacing_and_shape.spacing_scale} ·{" "}
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
      <ul className="mt-2 list-disc ml-5 text-xs text-white/80 space-y-0.5">
        {ux.core_jobs.map((j, i) => (
          <li key={i}>{j}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        <span className="text-white/70">Architecture:</span> {ux.information_architecture}
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
                  <span className="text-sm font-medium text-white truncate">{s.name}</span>
                  {s.is_key_screen && <span className="text-[10px] text-accent2 shrink-0">★ key</span>}
                </div>
                <span className="text-muted text-xs shrink-0">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 space-y-2 border-t border-edge text-xs">
                  <p className="text-white/80">{s.purpose}</p>
                  <p className="text-muted">
                    <span className="text-white/70">Primary action:</span> {s.primary_action}
                  </p>
                  <p className="text-muted">
                    <span className="text-white/70">Elements:</span> {s.key_elements.join(" · ")}
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {(["empty", "loading", "error", "success"] as const).map((k) => (
                      <div key={k} className="rounded bg-ink/60 px-2.5 py-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-accent2">{k}</span>
                        <p className="text-white/80">{s.states[k]}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-muted">
                    <span className="text-white/70">Responsive:</span> {s.responsive_notes}
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
              <div className="text-xs font-medium text-white">{f.name}</div>
              <p className="mt-1 text-[11px] text-muted">{f.steps.join(" → ")}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function MockupPanel({
  projectId,
  screens,
  mockups,
  busy,
  post,
}: {
  projectId: string;
  screens: Screen[];
  mockups: Record<string, string> | null;
  busy: boolean;
  post: (path: string, body?: any) => Promise<boolean>;
}) {
  const keyScreens = screens.filter((s) => s.is_key_screen).slice(0, 4);
  const done = mockups || {};
  const previewUrl = (id: string) => `/api/projects/${projectId}/product-design/preview?screen=${id}`;

  return (
    <Section title="HTML mockups — key screens">
      <p className="text-xs text-muted mb-3">
        High-fidelity static previews built from the tokens above. Open them in a browser, regenerate any screen you
        don’t like, or download the HTML.
      </p>
      <div className="space-y-2">
        {keyScreens.map((s) => {
          const ready = !!done[s.id];
          return (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge px-3 py-2.5">
              <span className="text-sm text-white">{s.name}</span>
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
              <span className="text-xs font-medium text-white">{c.name}</span>
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
        <ul className="space-y-1 text-xs text-white/85">
          {d.dos.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ok shrink-0">✓</span>
              {x}
            </li>
          ))}
        </ul>
        <ul className="space-y-1 text-xs text-white/85">
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
