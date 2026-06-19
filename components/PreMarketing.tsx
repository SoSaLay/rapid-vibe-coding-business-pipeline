"use client";

import { useEffect, useState } from "react";

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
function LaunchPanel({ projectId, kit, onUpdated }: { projectId: string; kit: Kit; onUpdated: () => void }) {
  const [sbReady, setSbReady] = useState<boolean | null>(null);
  const [sql, setSql] = useState("");
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [landingReady, setLandingReady] = useState(false);
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
    const res = await fetch(`/api/projects/${projectId}/pre-marketing/landing`, { method: "POST" });
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
              Generates a self-contained page from your kit, with the waitlist form wired to Supabase. Preview it, then
              deploy the HTML anywhere (Vercel / Netlify / Amplify / S3).
            </p>
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
