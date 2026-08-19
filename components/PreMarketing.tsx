"use client";

import { useEffect, useState } from "react";
import { EngineSelector } from "./EngineSelector";
import { ImageZoom } from "./ImageZoom";
import { Interject } from "./Interject";
import { StopButton, useStopper } from "./StopButton";
import { Doc, DocSection, DocP, DocSub, DocMuted, DocList, DocProse, DocFacts } from "./doc/Doc";

interface ContentPlatform {
  platform: string;
  content_type: string;
  audience_on_platform: string;
  strategy: string;
  themes: string[];
  posting_cadence: string;
  hook_examples: string[];
  cta_direction: string;
}

interface Kit {
  positioning: {
    problem_statement: string;
    headline: string;
    subheadline: string;
    benefit_bullets: string[];
    faq: { q: string; a: string }[];
  };
  offer: { type: string; headline: string; details: string; price_hypothesis: string };
  qualifying_questions: { question: string; why: string }[];
  social_proof: { quote: string; source: string }[];
  distribution_plan: { channel: string; tactic: string; template: string }[];
  fake_door_tests: { feature: string; copy: string }[];
  success_thresholds: { landing_conversion: string; waitlist_target: string; presale_target: string; decision_rule: string };
  content_library?: ContentPlatform[];
}

interface Brief {
  verdict: "proceed" | "pivot" | "stop" | "keep-collecting";
  confidence: string;
  demand_summary: string;
  segment_insights: string[];
  validated_positioning: string;
  what_to_change: string[];
  recommendation: string;
  metrics?: { signups: number; presale_interest: number };
}

export function PreMarketing({
  projectId,
  hasSpec,
  kit,
  frameworks,
  brief,
  mode = "doc",
  artifact,
  onUpdated,
}: {
  projectId: string;
  hasSpec: boolean;
  kit: Kit | null;
  frameworks: { ids: string[]; rationale: string } | null;
  brief: Brief | null;
  mode?: "doc" | "artifacts";
  artifact?: string;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopper = useStopper();

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pre-marketing/generate-kit`, { method: "POST", signal: stopper.signal() });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) return setError(d.error || "Failed to generate kit.");
      onUpdated();
    } catch (e: any) {
      setBusy(false);
      if (!stopper.isAbort(e)) setError(e?.message || "Failed to generate kit.");
    }
  }

  async function skip() {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/skip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: "pre-marketing" }),
    });
    setBusy(false);
    if (res.ok) onUpdated();
  }

  if (!hasSpec) return <div className="card p-6 text-sm text-muted">Locked until the product spec is complete.</div>;

  // Artifact face — the generated deliverables (brand visuals, landing page,
  // waitlist, email). These build on the validation kit, so prompt for it first.
  if (mode === "artifacts") {
    if (!kit) {
      return (
        <div className="card p-6 text-sm text-muted">
          Generate the validation kit first (in the report view) — the landing page, waitlist, email and brand
          visuals build on its positioning and offer.
        </div>
      );
    }
    // One artifact per page (selected from the sidebar menu).
    return (
      <div className="space-y-4">
        <Interject projectId={projectId} phase="pre-marketing" />
        {artifact === "brand-visuals" && <BrandVisuals projectId={projectId} />}
        {artifact === "landing" && <LaunchPanel projectId={projectId} kit={kit} only="landing" />}
        {artifact === "waitlist" && <LaunchPanel projectId={projectId} kit={kit} only="waitlist" />}
        {artifact === "email" && <EmailBroadcastHub projectId={projectId} />}
      </div>
    );
  }

  // Document face — the informational read (verdict brief + validation kit).
  if (kit) {
    return (
      <Doc>
        {brief && <BriefSection brief={brief} />}
        <KitSections kit={kit} frameworks={frameworks} onRegen={generate} busy={busy} />
      </Doc>
    );
  }

  return (
    <div className="card p-6 space-y-4">
      <p className="text-sm text-muted text-center">
        Prove real intent before you build — a validation kit: landing-page copy, a pre-sell offer, and a distribution
        plan grounded in your spec.
      </p>
      <Interject projectId={projectId} phase="pre-marketing" />
      <div className="flex items-center justify-center gap-3">
        <button className="btn-ghost" disabled={busy} onClick={skip}>
          Skip
        </button>
        <button className="btn-primary" disabled={busy} onClick={generate}>
          {busy ? "Generating kit…" : "Generate validation kit"}
        </button>
        {busy && <StopButton onStop={stopper.stop} />}
      </div>
      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

function BriefSection({ brief }: { brief: Brief }) {
  const style: Record<string, string> = {
    proceed: "text-onbright bg-ok",
    pivot: "text-onbright bg-warn",
    stop: "text-fg bg-bad",
    "keep-collecting": "text-fg bg-edge",
  };
  return (
    <DocSection title="Verdict">
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${style[brief.verdict]}`}>{brief.verdict}</span>
        <span className="doc-muted">
          confidence: {brief.confidence}
          {brief.metrics ? ` · ${brief.metrics.signups} signups · ${brief.metrics.presale_interest} pre-sale` : ""}
        </span>
      </div>
      <div className="mt-5">
        <DocProse text={brief.demand_summary} tone="lede" />
      </div>
      <div className="mt-3">
        <DocProse text={brief.recommendation} tone="muted" />
      </div>
    </DocSection>
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

function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-[11px] text-accent2 hover:text-fg"
      onClick={() => navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })}
    >
      {copied ? "copied ✓" : "copy"}
    </button>
  );
}

/* ---------------- Stage 2 + 3: launch, track, decide ---------------- */
type AssetRef = { file: string; at: string };
const ASSET_KINDS: { key: "logo" | "hero" | "og"; label: string }[] = [
  { key: "logo", label: "Logo" },
  { key: "hero", label: "Hero image" },
  { key: "og", label: "Share / OG image" },
];

interface DirectionOption {
  id: string;
  name: string;
  vibe: string;
  color_feel: string;
  logo_concept: string;
  ui_feel: string;
  why_fits: string;
}

function DirectionPicker({ projectId, onSelected }: { projectId: string; onSelected: () => void }) {
  const [options, setOptions] = useState<DirectionOption[]>([]);
  const [selected, setSelected] = useState<DirectionOption | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/pre-marketing/directions`)
      .then((r) => r.json())
      .then((d) => {
        setOptions(d.options || []);
        setSelected(d.selected || null);
      })
      .catch(() => {});
  }, [projectId]);

  async function explore() {
    setBusy("explore");
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/directions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "propose" }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(d.error || "Failed to explore directions.");
    setOptions(d.options || []);
  }

  async function pick(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/directions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select", id }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(d.error || "Failed to select direction.");
    setSelected(d.selected || null);
    onSelected();
  }

  return (
    <div className="rounded-lg border border-edge bg-edge/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-muted">Creative direction</div>
        <button className="btn-ghost text-[11px]" disabled={!!busy} onClick={explore}>
          {busy === "explore" ? "Thinking…" : options.length ? "Re-explore" : "Explore directions"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        See the thinking before anything is generated. Pick one — it seeds your logo, assets, landing page, and the
        product UI.
      </p>

      {options.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {options.map((o) => {
            const isSel = selected?.id === o.id;
            return (
              <div
                key={o.id}
                className={`rounded-lg border p-3 ${isSel ? "border-accent2 bg-accent2/10" : "border-edge bg-ink/30"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-fg">{o.name}</span>
                  {isSel && <span className="text-[10px] text-accent2">✓ chosen</span>}
                </div>
                <p className="mt-1 text-[11px] text-muted">{o.vibe}</p>
                <p className="mt-1 text-[10px] text-muted">
                  <span className="text-fg/70">Colors:</span> {o.color_feel}
                </p>
                <p className="mt-0.5 text-[10px] text-muted">
                  <span className="text-fg/70">Logo:</span> {o.logo_concept}
                </p>
                <p className="mt-0.5 text-[10px] text-muted">
                  <span className="text-fg/70">UI:</span> {o.ui_feel}
                </p>
                <button
                  className={isSel ? "btn-ghost mt-2 text-[11px]" : "btn-primary mt-2 text-[11px]"}
                  disabled={!!busy}
                  onClick={() => pick(o.id)}
                >
                  {busy === o.id ? "…" : isSel ? "Chosen" : "Use this"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selected && options.length === 0 && (
        <p className="mt-2 text-[11px] text-fg/80">
          Direction: <span className="text-accent2">{selected.name}</span> — {selected.vibe}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}

function BrandVisuals({ projectId }: { projectId: string }) {
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<Record<string, AssetRef>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/google")
      .then((r) => r.json())
      .then((d) => setGoogleReady(!!d.configured))
      .catch(() => setGoogleReady(false));
    fetch(`/api/projects/${projectId}/pre-marketing/assets`)
      .then((r) => r.json())
      .then((d) => setAssets(d.assets || {}))
      .catch(() => {});
  }, [projectId]);

  async function connect() {
    setBusy("connect");
    setError(null);
    const res = await fetch("/api/google/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!d.ok) return setError(d.error || "Failed to connect Google AI.");
    setGoogleReady(true);
    setOpen(false);
  }

  async function generate(kind: "all" | "logo" | "hero" | "og") {
    setBusy(kind);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(d.error || "Failed to generate brand visuals.");
    setAssets(d.assets || {});
  }

  if (googleReady === null) return null;
  const assetUrl = (file: string) => `/api/projects/${projectId}/assets?file=${file}`;

  return (
    <Section title="Brand visuals (Nano Banana)">
      <p className="text-xs text-muted mb-3">
        Logo, hero, and share image from your positioning — embedded into the landing page.
      </p>

      <div className="mb-3 space-y-3">
        <EngineSelector projectId={projectId} />
        <DirectionPicker projectId={projectId} onSelected={() => {}} />
      </div>

      {!googleReady ? (
        <div className="rounded-lg border border-edge bg-edge/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted">
              <span className="text-fg/80 font-medium">Connect Google (Gemini)</span> to generate brand visuals. Free
              key at aistudio.google.com → API keys. Stored locally, reused by every phase.
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
              <button className="btn-primary shrink-0" disabled={busy === "connect" || !apiKey} onClick={connect}>
                {busy === "connect" ? "Connecting…" : "Connect"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {ASSET_KINDS.map(({ key, label }) => {
              const a = assets[key];
              return (
                <div key={key} className="rounded-lg border border-edge p-2 text-center">
                  {a ? (
                    <ImageZoom src={assetUrl(a.file)} alt={label} className="mx-auto h-20 w-full rounded object-contain bg-ink/40" />
                  ) : (
                    <div className="flex h-20 items-center justify-center rounded border border-dashed border-edge text-[10px] text-muted">
                      {label}
                    </div>
                  )}
                  <button
                    className="btn-ghost mt-1.5 text-[11px]"
                    disabled={!!busy}
                    onClick={() => generate(key)}
                  >
                    {busy === key ? "…" : a ? "Regenerate" : "Generate"}
                  </button>
                </div>
              );
            })}
          </div>
          <button className="btn-primary mt-3" disabled={!!busy} onClick={() => generate("all")}>
            {busy === "all" ? "Generating… (logo → hero → share)" : "Generate all brand visuals"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </Section>
  );
}

function LaunchPanel({ projectId, kit, only }: { projectId: string; kit: Kit; only?: "landing" | "waitlist" }) {
  const [sbReady, setSbReady] = useState<boolean | null>(null);
  const [sql, setSql] = useState("");
  const [landingReady, setLandingReady] = useState(false);
  const [threeHero, setThreeHero] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<{ total: number; presale_interest: number } | null>(null);
  const [editText, setEditText] = useState("");
  const [landingVersion, setLandingVersion] = useState(0);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopper = useStopper();

  useEffect(() => {
    fetch("/api/supabase")
      .then((r) => r.json())
      .then((d) => {
        setSbReady(!!d.configured);
        setSql(d.sql || "");
      })
      .catch(() => setSbReady(false));
    fetch(`/api/projects/${projectId}/pre-marketing/landing`).then((r) => setLandingReady(r.ok));
    fetch(`/api/projects/${projectId}/pre-marketing/deploy`)
      .then((r) => r.json())
      .then((d) => setDeployedUrl(d.url || null))
      .catch(() => {});
  }, [projectId]);

  async function genLanding() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pre-marketing/landing`, {
        method: "POST",
        signal: stopper.signal(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threeHero }),
      });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) return setError(d.error || "Failed to generate landing page.");
      setLandingReady(true);
    } catch (e: any) {
      setBusy(false);
      if (!stopper.isAbort(e)) setError(e?.message || "Failed to generate landing page.");
    }
  }

  async function editLanding() {
    if (!editText.trim()) return;
    setBusy(true);
    setError(null);
    setEditNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pre-marketing/landing/edit`, {
        method: "POST",
        signal: stopper.signal(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: editText }),
      });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) return setError(d.error || "Couldn't apply that edit.");
      setEditText("");
      setLandingVersion((v) => v + 1); // cache-bust the preview link
      setEditNote("Applied. Re-open the preview to see it.");
    } catch (e: any) {
      setBusy(false);
      if (!stopper.isAbort(e)) setError(e?.message || "Couldn't apply that edit.");
    }
  }

  async function deploy() {
    setDeploying(true);
    setError(null);
    setDeployLog([]);
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/deploy`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setDeploying(false);
    setDeployLog(d.log || []);
    if (!res.ok) return setError(d.error || "Failed to deploy landing page.");
    setDeployedUrl(d.url || null);
  }

  async function refreshSignups() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/signups`);
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error || "Failed to read signups.");
    setMetrics(d);
  }

  const landingUrl = `/api/projects/${projectId}/pre-marketing/landing`;

  return (
    <div className="space-y-4">
      <div className="text-[11px] uppercase tracking-wider text-accent2">Launch &amp; track</div>

      {sbReady === false && (
        <Section title="Waitlist needs Supabase">
          <p className="text-xs text-muted">
            Connect Supabase once in <span className="text-fg/80 font-medium">Complete onboarding</span> (top right) to
            enable the waitlist store and signups dashboard.
          </p>
        </Section>
      )}

      {sbReady && sql && (
        <Section title="One-time: create the signups table" action={<Copyable text={sql} />}>
          <p className="text-xs text-muted mb-2">Paste this once in Supabase → SQL Editor → Run.</p>
          <pre className="whitespace-pre-wrap rounded bg-ink p-2 text-[11px] text-fg/80">{sql}</pre>
        </Section>
      )}

      {sbReady && (!only || only === "landing") && (
        <>
          <Section title="Landing page (Launch UI style)">
            <p className="text-xs text-muted mb-2">
              A self-contained page from your kit, waitlist wired to Supabase. Preview, then deploy anywhere.
            </p>
            <label className="mb-2 flex items-center gap-2 text-xs text-fg/80">
              <input type="checkbox" className="accent-accent2" checked={threeHero} onChange={(e) => setThreeHero(e.target.checked)} />
              Add a 3D animated hero (Three.js / WebGL) — heavier, best on a strong-visual brand
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary" disabled={busy} onClick={genLanding}>
                {busy ? "Generating…" : landingReady ? "Regenerate page" : "Generate landing page"}
              </button>
              {busy && <StopButton onStop={stopper.stop} />}
              {landingReady && (
                <>
                  <a className="btn-ghost" href={`${landingUrl}?v=${landingVersion}`} target="_blank" rel="noreferrer">
                    Preview ↗
                  </a>
                  <a className="btn-ghost" href={`${landingUrl}?download=1&v=${landingVersion}`}>
                    Download HTML
                  </a>
                </>
              )}
            </div>

            {landingReady && (
              <div className="mt-3 rounded-lg border border-edge bg-edge/10 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted mb-1.5">Edit the page</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="input"
                    placeholder="Describe a change — e.g. 'shorten the headline' or 'remove the FAQ'"
                    value={editText}
                    disabled={busy}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && editLanding()}
                  />
                  <button className="btn-primary shrink-0" disabled={busy || !editText.trim()} onClick={editLanding}>
                    {busy ? "Applying…" : "Apply"}
                  </button>
                  {busy && <StopButton onStop={stopper.stop} className="shrink-0" />}
                </div>
                {editNote && <p className="mt-2 text-[11px] text-ok">{editNote}</p>}
              </div>
            )}

            {landingReady && (
              <div className="mt-3 rounded-lg border border-edge bg-edge/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted">
                    <span className="text-fg/80 font-medium">Quick deploy</span> — ships this page to AWS Amplify at its
                    own URL using your local <code className="text-accent2">aws</code> CLI (same setup Phase 8 uses). The
                    live URL is baked in as the canonical/share URL.
                  </p>
                  <button className="btn-primary shrink-0" disabled={busy || deploying} onClick={deploy}>
                    {deploying ? "Deploying… (~1–2 min)" : deployedUrl ? "Redeploy" : "Deploy to AWS Amplify"}
                  </button>
                </div>
                {deployedUrl && (
                  <p className="mt-2 text-xs text-fg/80">
                    Live at{" "}
                    <a className="text-accent2 hover:text-fg" href={deployedUrl} target="_blank" rel="noreferrer">
                      {deployedUrl} ↗
                    </a>
                  </p>
                )}
                {deployLog.length > 0 && (
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-ink p-2 text-[11px] text-fg/70">
                    {deployLog.join("\n")}
                  </pre>
                )}
              </div>
            )}
          </Section>
        </>
      )}

      {sbReady && (!only || only === "waitlist") && (
        <Section title="Waitlist dashboard" action={<button className="text-[11px] text-accent2 hover:text-fg" onClick={refreshSignups}>refresh</button>}>
          {!metrics ? (
            <p className="text-xs text-muted">Drive traffic to your deployed page, then refresh to see signups.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-edge/40 p-3">
                <div className="text-2xl font-semibold text-fg">{metrics.total}</div>
                <div className="text-xs text-muted">signups · target {kit.success_thresholds.waitlist_target}</div>
              </div>
              <div className="rounded-lg bg-edge/40 p-3">
                <div className="text-2xl font-semibold text-fg">{metrics.presale_interest}</div>
                <div className="text-xs text-muted">pre-sale interest · target {kit.success_thresholds.presale_target}</div>
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">⚖️ {kit.success_thresholds.decision_rule}</p>
        </Section>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

/**
 * Email broadcast hub — the project-wide opt-in + the manual send tool.
 * The "Will this product use email?" choice is stored in project settings and
 * gates every email surface across the pipeline. When opted in: connect Resend,
 * sync the waitlist from Supabase into an audience, compose, and broadcast.
 */
function EmailBroadcastHub({ projectId }: { projectId: string }) {
  const [emailEnabled, setEmailEnabled] = useState<boolean | null | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [syncedCount, setSyncedCount] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [testTo, setTestTo] = useState("");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/settings`)
      .then((r) => r.json())
      // boolean = decided; anything else = undecided (null) so we prompt the founder.
      .then((d) => setEmailEnabled(typeof d.emailEnabled === "boolean" ? d.emailEnabled : null))
      .catch(() => setEmailEnabled(null));
    fetch(`/api/projects/${projectId}/pre-marketing/broadcast`)
      .then((r) => r.json())
      .then((d) => {
        setConnected(!!d.connected);
        setFrom(d.from || null);
        setSyncedCount(d.syncedCount ?? null);
        setLastSentAt(d.lastSentAt || null);
        if (d.seed?.subject && !subject) setSubject(d.seed.subject);
        if (d.seed?.body && !body) setBody(d.seed.body);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function setPref(value: boolean) {
    setBusy("pref");
    await fetch(`/api/projects/${projectId}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailEnabled: value }),
    }).catch(() => {});
    setBusy(null);
    setEmailEnabled(value);
  }

  async function post(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    setNote(null);
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(d.error || "Request failed.");
      return null;
    }
    return d;
  }

  async function connect() {
    setBusy("connect");
    setError(null);
    const res = await fetch("/api/email/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!d.ok) return setError(d.error || "Failed to connect Resend.");
    setApiKey("");
    setConnected(true);
    const status = await fetch(`/api/projects/${projectId}/pre-marketing/broadcast`).then((r) => r.json());
    setFrom(status.from || null);
  }

  async function sync() {
    const d = await post("sync");
    if (d) {
      setSyncedCount(d.syncedCount ?? 0);
      setNote(`Synced ${d.syncedCount} of ${d.totalSignups} signups into your Resend audience.`);
    }
  }

  async function sendTest() {
    const d = await post("test", { to: testTo, subject, body });
    if (d) setNote(`Test sent to ${testTo}${d.from ? ` from ${d.from}` : ""}. Check your inbox.`);
  }

  async function sendBroadcast() {
    const d = await post("send", { subject, body });
    if (d) {
      setLastSentAt(new Date().toISOString());
      setNote("Broadcast sent. Open/click stats appear in your Resend dashboard.");
    }
  }

  // --- Opt-in gate: ask the question once, then gate everything on the answer ---
  if (emailEnabled === undefined) return null; // still loading

  if (emailEnabled === null) {
    return (
      <Section title="Email — will this product use it?">
        <p className="text-xs text-muted mb-3">
          Email here means <span className="text-fg/80">waitlist nurture, launch announcements, product/feature
          updates, and marketing broadcasts</span> — sent by you, when you want. (Login & billing emails are handled
          separately by your auth/payments provider and aren’t this.) Some products don’t need email at all. Your
          choice applies across the whole pipeline and is reversible.
        </p>
        <div className="flex gap-3">
          <button className="btn-primary" disabled={busy === "pref"} onClick={() => setPref(true)}>
            Yes, enable email
          </button>
          <button className="btn-ghost" disabled={busy === "pref"} onClick={() => setPref(false)}>
            No, this product won’t use email
          </button>
        </div>
      </Section>
    );
  }

  if (emailEnabled === false) {
    return (
      <Section title="Email — off for this product">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">Email is disabled across the pipeline for this project.</p>
          <button className="btn-ghost text-xs" disabled={busy === "pref"} onClick={() => setPref(true)}>
            Enable email
          </button>
        </div>
      </Section>
    );
  }

  // --- Opted in ---
  return (
    <Section
      title="Email your audience"
      action={
        <button className="text-[11px] text-muted hover:text-fg" disabled={busy === "pref"} onClick={() => setPref(false)}>
          turn off
        </button>
      }
    >
      {!connected ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Connect Resend (free, 3k emails/mo) to broadcast to your list. Paste your{" "}
            <code className="text-accent2">re_…</code> key — stored locally.{" "}
            <a className="text-accent2 hover:text-fg" href="https://resend.com/api-keys" target="_blank" rel="noreferrer">
              Get a key ↗
            </a>
          </p>
          <div className="flex gap-2">
            <input
              className="input"
              type="password"
              placeholder="Resend API key (re_…)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button className="btn-primary shrink-0" disabled={busy === "connect" || !apiKey} onClick={connect}>
              {busy === "connect" ? "Connecting…" : "Connect"}
            </button>
          </div>
          <p className="text-[10px] text-muted">
            To send from your own address, verify a domain at{" "}
            <a className="text-accent2 hover:text-fg" href="https://resend.com/domains" target="_blank" rel="noreferrer">
              resend.com/domains
            </a>
            . Until then, “Send test to myself” uses Resend’s test address to your own inbox.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted">
              {from ? (
                <>Sending as <span className="text-fg/80">{from}</span>. </>
              ) : null}
              {syncedCount != null ? `${syncedCount} contacts in your audience.` : "Sync your waitlist to build the audience."}
            </p>
            <button className="btn-ghost text-xs shrink-0" disabled={busy === "sync"} onClick={sync}>
              {busy === "sync" ? "Syncing…" : "Sync waitlist → audience"}
            </button>
          </div>

          <div className="space-y-2">
            <input
              className="input"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className="input min-h-[120px]"
              placeholder="Write your update — a waitlist note, launch announcement, or 'new feature is out'…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-[220px]"
              type="email"
              placeholder="you@email.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <button className="btn-ghost text-xs" disabled={busy === "test" || !testTo} onClick={sendTest}>
              {busy === "test" ? "Sending…" : "Send test to myself"}
            </button>
            <button
              className="btn-primary text-xs"
              disabled={busy === "send" || !subject || !body || !syncedCount}
              onClick={sendBroadcast}
            >
              {busy === "send" ? "Sending…" : "Send broadcast"}
            </button>
          </div>
          {lastSentAt && (
            <p className="text-[10px] text-muted">Last broadcast sent {new Date(lastSentAt).toLocaleString()}.</p>
          )}
        </div>
      )}

      {note && <p className="mt-2 text-[11px] text-ok">{note}</p>}
      {error && <p className="mt-2 text-[11px] text-bad">{error}</p>}
    </Section>
  );
}

function KitSections({
  kit,
  frameworks,
  onRegen,
  busy,
}: {
  kit: Kit;
  frameworks: { ids: string[]; rationale: string } | null;
  onRegen: () => void;
  busy: boolean;
}) {
  const p = kit.positioning;
  return (
    <>
      <DocSection title="Validation kit">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-2xl font-semibold text-fg">{p.headline}</h3>
            <p className="mt-1 text-muted">{p.subheadline}</p>
          </div>
          <button className="btn-ghost shrink-0" disabled={busy} onClick={onRegen}>
            {busy ? "…" : "Regenerate"}
          </button>
        </div>
        <DocMuted className="mt-3 italic">{p.problem_statement}</DocMuted>

        <div className="mt-8 space-y-8">
          <div>
            <DocSub>Benefit bullets</DocSub>
            <div className="mt-1">
              <DocList items={p.benefit_bullets} />
            </div>
          </div>
          <div>
            <DocSub>The offer (money signal)</DocSub>
            <DocP className="mt-1 font-medium text-fg">{kit.offer.headline}</DocP>
            <div className="mt-1">
              <DocProse text={kit.offer.details} tone="muted" />
            </div>
            <DocFacts
              items={[
                { label: "Offer type", value: kit.offer.type },
                { label: "Test price", value: <span className="text-accent2">{kit.offer.price_hypothesis}</span> },
              ]}
            />
          </div>
        </div>
      </DocSection>

      <DocSection title="Distribution">
        <div className="space-y-6">
          {kit.distribution_plan.map((d, i) => (
            <div key={i}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-fg">{d.channel}</p>
                <Copyable text={d.template} />
              </div>
              <div className="mt-0.5">
                <DocProse text={d.tactic} tone="muted" />
              </div>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-edge bg-ink p-3 text-xs text-fg/80">{d.template}</pre>
            </div>
          ))}
        </div>
      </DocSection>

      {kit.content_library?.length ? <ContentLibrarySection platforms={kit.content_library} /> : null}

      {frameworks?.ids?.length ? (
        <DocMuted>Playbooks applied: {frameworks.ids.join(", ")} · via marketing-skills</DocMuted>
      ) : null}
    </>
  );
}

const PLATFORM_ICONS: Record<string, string> = {
  "X (Twitter)": "𝕏",
  LinkedIn: "in",
  Instagram: "▣",
  "Short-form video": "▶",
  "Long-form": "▤",
  Forums: "◈",
};

function ContentLibrarySection({ platforms }: { platforms: ContentPlatform[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <DocSection title="Content library">
      <DocMuted className="mb-4">
        Evergreen direction for each channel. Not a content calendar — a strategic brief so every post you make moves
        people toward your landing page.
      </DocMuted>
      <div className="space-y-2">
        {platforms.map((p) => {
          const isOpen = open === p.platform;
          const icon = PLATFORM_ICONS[p.platform] ?? "•";
          return (
            <div key={p.platform} className="rounded-lg border border-edge overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-edge/30 transition-colors"
                onClick={() => setOpen(isOpen ? null : p.platform)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-accent2 font-bold text-sm w-5 text-center">{icon}</span>
                  <span className="text-sm font-medium text-fg">{p.platform}</span>
                  <span className="text-[11px] text-muted">{p.content_type} · {p.posting_cadence}</span>
                </div>
                <span className="text-muted text-xs">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-edge">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Who you're reaching</div>
                    <p className="text-xs text-fg/80">{p.audience_on_platform}</p>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Strategy & tone</div>
                    <p className="text-xs text-fg/80">{p.strategy}</p>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Evergreen themes</div>
                    <ul className="list-disc ml-5 space-y-0.5 text-xs text-fg/80">
                      {p.themes.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Hook starters (riff on these)</div>
                    <div className="space-y-1.5">
                      {p.hook_examples.map((h, i) => (
                        <div key={i} className="flex items-start gap-2 rounded bg-ink/60 px-3 py-2">
                          <span className="text-accent2 text-[11px] mt-0.5">→</span>
                          <p className="text-xs text-fg/90 italic">"{h}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted mb-1">CTA direction</div>
                    <p className="text-xs text-fg/80">{p.cta_direction}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DocSection>
  );
}
