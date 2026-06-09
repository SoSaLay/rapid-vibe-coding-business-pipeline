"use client";

import { useState } from "react";

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
}

export function PreMarketing({
  projectId,
  hasSpec,
  kit,
  frameworks,
  onUpdated,
}: {
  projectId: string;
  hasSpec: boolean;
  kit: Kit | null;
  frameworks: { ids: string[]; rationale: string } | null;
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

  if (kit) return <KitView kit={kit} frameworks={frameworks} onRegen={generate} busy={busy} />;

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

function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-[11px] text-accent2 hover:text-white"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "copied ✓" : "copy"}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted mb-2">{title}</div>
      {children}
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
          <div className="text-[11px] uppercase tracking-wider text-ok">Validation kit ready</div>
          <button className="btn-ghost" disabled={busy} onClick={onRegen}>
            {busy ? "…" : "Regenerate"}
          </button>
        </div>
        <h3 className="mt-2 text-xl font-semibold text-white">{p.headline}</h3>
        <p className="text-sm text-muted">{p.subheadline}</p>
        <p className="mt-2 text-xs text-muted italic">{p.problem_statement}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Benefit bullets">
          <ul className="list-disc ml-5 space-y-0.5 text-sm text-white/85">
            {p.benefit_bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </Section>
        <Section title="The offer (money signal)">
          <div className="text-sm text-white">{kit.offer.headline}</div>
          <div className="text-xs text-muted mt-1">{kit.offer.details}</div>
          <div className="text-xs text-accent2 mt-2">Test price: {kit.offer.price_hypothesis}</div>
          <div className="text-[11px] text-muted">Type: {kit.offer.type}</div>
        </Section>
      </div>

      <Section title="Social proof (real voices)">
        <div className="space-y-2">
          {kit.social_proof.map((s, i) => (
            <blockquote key={i} className="border-l-2 border-l-accent pl-3 text-sm text-white/90 italic">
              “{s.quote}” <span className="text-xs text-muted not-italic">— {s.source}</span>
            </blockquote>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Signup qualifying questions">
          <ul className="space-y-2">
            {kit.qualifying_questions.map((q, i) => (
              <li key={i} className="text-sm">
                <span className="text-white">{q.question}</span>
                <span className="block text-xs text-muted">{q.why}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="FAQ">
          <ul className="space-y-2">
            {p.faq.map((f, i) => (
              <li key={i} className="text-sm">
                <span className="text-white">{f.q}</span>
                <span className="block text-xs text-muted">{f.a}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Distribution plan">
        <div className="space-y-3">
          {kit.distribution_plan.map((d, i) => (
            <div key={i} className="rounded-lg border border-edge p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{d.channel}</span>
                <Copyable text={d.template} />
              </div>
              <div className="text-xs text-muted">{d.tactic}</div>
              <pre className="mt-2 whitespace-pre-wrap rounded bg-ink p-2 text-xs text-white/80">{d.template}</pre>
            </div>
          ))}
        </div>
      </Section>

      {kit.fake_door_tests.length > 0 && (
        <Section title="Fake-door feature tests">
          <ul className="space-y-1">
            {kit.fake_door_tests.map((f, i) => (
              <li key={i} className="text-sm">
                <span className="text-white">{f.feature}</span>
                <span className="block text-xs text-muted">{f.copy}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Success thresholds (the gate)">
        <ul className="space-y-1 text-sm text-white/85">
          <li>📧 Landing conversion: {kit.success_thresholds.landing_conversion}</li>
          <li>📝 Waitlist target: {kit.success_thresholds.waitlist_target}</li>
          <li>💰 Pre-sale target: {kit.success_thresholds.presale_target}</li>
          <li className="text-accent2">⚖️ {kit.success_thresholds.decision_rule}</li>
        </ul>
      </Section>

      <div className="card p-4 text-xs text-muted">
        <span className="text-white/80">Next (Stage 2 & 3, coming):</span> generate a deployable Launch-UI landing page
        from this kit, wire the waitlist to Supabase, then track signups against these thresholds for the go/no-go.
        {frameworks?.ids?.length ? <div className="mt-1">Playbooks applied: {frameworks.ids.join(", ")} · via marketing-skills</div> : null}
      </div>
    </div>
  );
}
