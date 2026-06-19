"use client";

import { useEffect, useState } from "react";
import { EngineSelector } from "./EngineSelector";

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
  onUpdated,
}: {
  projectId: string;
  hasSpec: boolean;
  kit: Kit | null;
  frameworks: { ids: string[]; rationale: string } | null;
  brief: Brief | null;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/generate-kit`, { method: "POST" });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error || "Failed to generate kit.");
    onUpdated();
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

  if (kit) {
    return (
      <div className="space-y-4">
        {brief && <BriefView brief={brief} />}
        <KitView kit={kit} frameworks={frameworks} onRegen={generate} busy={busy} />
        <BrandVisuals projectId={projectId} />
        <LaunchPanel projectId={projectId} kit={kit} onUpdated={onUpdated} />
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
        <p className="text-xs text-warn">
          <span className="font-semibold">Optional step.</span> Pre-Marketing proves real intent — a landing page +
          waitlist where actual people sign up. Skip if you’re building for fun; do it if you intend to monetize.
        </p>
      </div>
      <p className="text-sm text-muted text-center">
        Generate a pre-launch validation kit: landing-page copy, a de-risking pre-sell offer, qualifying questions, and a
        distribution plan — grounded in your spec and the real market evidence.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button className="btn-ghost" disabled={busy} onClick={skip}>
          Skip
        </button>
        <button className="btn-primary" disabled={busy} onClick={generate}>
          {busy ? "Generating kit…" : "Generate validation kit"}
        </button>
      </div>
      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

function BriefView({ brief }: { brief: Brief }) {
  const style: Record<string, string> = {
    proceed: "text-onbright bg-ok",
    pivot: "text-onbright bg-warn",
    stop: "text-fg bg-bad",
    "keep-collecting": "text-fg bg-edge",
  };
  return (
    <div className="card p-5 border border-ok/30">
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${style[brief.verdict]}`}>{brief.verdict}</span>
        <span className="text-xs text-muted">
          confidence: {brief.confidence}
          {brief.metrics ? ` · ${brief.metrics.signups} signups · ${brief.metrics.presale_interest} pre-sale` : ""}
        </span>
      </div>
      <p className="mt-3 text-sm text-fg/90">{brief.demand_summary}</p>
      <p className="mt-2 text-sm text-muted">{brief.recommendation}</p>
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
        Generate a logo, hero, and share image from your positioning — they’re embedded straight into the landing page,
        then carried forward and locked in Product Design.
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(a.file)} alt={label} className="mx-auto h-20 w-full rounded object-contain bg-ink/40" />
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

function LaunchPanel({ projectId, kit, onUpdated }: { projectId: string; kit: Kit; onUpdated: () => void }) {
  const [sbReady, setSbReady] = useState<boolean | null>(null);
  const [sql, setSql] = useState("");
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [landingReady, setLandingReady] = useState(false);
  const [threeHero, setThreeHero] = useState(false);
  const [metrics, setMetrics] = useState<{ total: number; presale_interest: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/supabase")
      .then((r) => r.json())
      .then((d) => {
        setSbReady(!!d.configured);
        setSql(d.sql || "");
      })
      .catch(() => setSbReady(false));
    fetch(`/api/projects/${projectId}/pre-marketing/landing`).then((r) => setLandingReady(r.ok));
  }, [projectId]);

  async function connectSupabase() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/supabase/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, anonKey, serviceKey }),
    });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) return setError(d.error || "Failed to connect Supabase.");
    setSbReady(true);
    setTableMissing(!!d.tableMissing);
    setSql(d.sql || sql);
  }

  async function genLanding() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/landing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threeHero }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error || "Failed to generate landing page.");
    setLandingReady(true);
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

  async function evaluate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/evaluate`, { method: "POST" });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error || "Failed to evaluate.");
    onUpdated();
  }

  const landingUrl = `/api/projects/${projectId}/pre-marketing/landing`;

  return (
    <div className="space-y-4">
      <div className="text-[11px] uppercase tracking-wider text-accent2">Launch &amp; track</div>

      {sbReady === false && (
        <Section title="Connect Supabase (waitlist store)">
          <p className="text-xs text-muted mb-2">
            Create a free project at supabase.com → Project Settings → API for the URL + keys. Stored locally.
          </p>
          <div className="space-y-2">
            <input className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input className="input" type="password" placeholder="anon public key" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
            <input className="input" type="password" placeholder="service_role key" value={serviceKey} onChange={(e) => setServiceKey(e.target.value)} />
            <button className="btn-primary" disabled={busy || !url || !anonKey || !serviceKey} onClick={connectSupabase}>
              {busy ? "Connecting…" : "Connect Supabase"}
            </button>
          </div>
        </Section>
      )}

      {(tableMissing || sbReady) && sql && (
        <Section title="One-time: create the signups table" action={<Copyable text={sql} />}>
          <p className="text-xs text-muted mb-2">
            {tableMissing ? "Table not found — " : ""}Paste this once in Supabase → SQL Editor → Run.
          </p>
          <pre className="whitespace-pre-wrap rounded bg-ink p-2 text-[11px] text-fg/80">{sql}</pre>
        </Section>
      )}

      {sbReady && (
        <>
          <Section title="Landing page (Launch UI style)">
            <p className="text-xs text-muted mb-2">
              Generates a self-contained page from your kit, with the waitlist form wired to Supabase. Tasteful motion is
              always on (scroll reveals, animated gradient, hover lifts) and respects reduced-motion. Preview it, then
              deploy the HTML anywhere (Vercel / Netlify / Amplify / S3).
            </p>
            <label className="mb-2 flex items-center gap-2 text-xs text-fg/80">
              <input type="checkbox" className="accent-accent2" checked={threeHero} onChange={(e) => setThreeHero(e.target.checked)} />
              Add a 3D animated hero (Three.js / WebGL) — heavier, best on a strong-visual brand
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary" disabled={busy} onClick={genLanding}>
                {busy ? "Generating…" : landingReady ? "Regenerate page" : "Generate landing page"}
              </button>
              {landingReady && (
                <>
                  <a className="btn-ghost" href={landingUrl} target="_blank" rel="noreferrer">
                    Preview ↗
                  </a>
                  <a className="btn-ghost" href={`${landingUrl}?download=1`}>
                    Download HTML
                  </a>
                </>
              )}
            </div>
          </Section>

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

          <Section title="Decide">
            <p className="text-xs text-muted mb-2">
              When you’ve collected enough signal, evaluate against your thresholds for a proceed / pivot / stop verdict.
            </p>
            <button className="btn-primary" disabled={busy} onClick={evaluate}>
              {busy ? "Evaluating…" : "Evaluate & decide →"}
            </button>
          </Section>
        </>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

function KitView({
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
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-ok">Validation kit</div>
          <button className="btn-ghost" disabled={busy} onClick={onRegen}>
            {busy ? "…" : "Regenerate"}
          </button>
        </div>
        <h3 className="mt-2 text-xl font-semibold text-fg">{p.headline}</h3>
        <p className="text-sm text-muted">{p.subheadline}</p>
        <p className="mt-2 text-xs text-muted italic">{p.problem_statement}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Benefit bullets">
          <ul className="list-disc ml-5 space-y-0.5 text-sm text-fg/85">
            {p.benefit_bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </Section>
        <Section title="The offer (money signal)">
          <div className="text-sm text-fg">{kit.offer.headline}</div>
          <div className="text-xs text-muted mt-1">{kit.offer.details}</div>
          <div className="text-xs text-accent2 mt-2">Test price: {kit.offer.price_hypothesis}</div>
        </Section>
      </div>

      <Section title="Distribution plan">
        <div className="space-y-3">
          {kit.distribution_plan.map((d, i) => (
            <div key={i} className="rounded-lg border border-edge p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">{d.channel}</span>
                <Copyable text={d.template} />
              </div>
              <div className="text-xs text-muted">{d.tactic}</div>
              <pre className="mt-2 whitespace-pre-wrap rounded bg-ink p-2 text-xs text-fg/80">{d.template}</pre>
            </div>
          ))}
        </div>
      </Section>

      {kit.content_library?.length ? <ContentLibraryView platforms={kit.content_library} /> : null}

      {frameworks?.ids?.length ? (
        <p className="text-xs text-muted">Playbooks applied: {frameworks.ids.join(", ")} · via marketing-skills</p>
      ) : null}
    </div>
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

function ContentLibraryView({ platforms }: { platforms: ContentPlatform[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Section title="Content library — platform playbook">
      <p className="text-xs text-muted mb-3">
        Evergreen direction for each channel. Not a content calendar — a strategic brief so every post you make moves
        people toward your landing page.
      </p>
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
    </Section>
  );
}
