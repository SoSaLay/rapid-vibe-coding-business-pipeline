"use client";

import { useEffect, useState } from "react";

interface ValidationReport {
  verdict: "build" | "refine" | "reject" | "archive";
  confidence: string;
  demand_signal: number;
  summary: string;
  themes: { theme: string; detail: string }[];
  representative_quotes: { quote: string; source: string; url: string }[];
  sentiment: string;
  pain_intensity: string;
  market_overview: string;
  market_size: string;
  competitive_landscape: { name: string; positioning: string; strengths: string; gaps: string }[];
  target_segments: { segment: string; description: string }[];
  positioning: string;
  pricing_signal: string;
  what_must_be_true: string[];
  key_risks: string[];
  kill_criteria: string[];
  recommendation: string;
  sources?: { kind?: string; title: string; url: string }[];
}

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  build: { label: "Build it", cls: "text-ink bg-ok" },
  refine: { label: "Refine first", cls: "text-ink bg-warn" },
  reject: { label: "Reject", cls: "text-white bg-bad" },
  archive: { label: "Archive", cls: "text-white bg-edge" },
};

export function IdeaValidation({
  projectId,
  hasSpec,
  report,
  onUpdated,
}: {
  projectId: string;
  hasSpec: boolean;
  report: ValidationReport | null;
  onUpdated: () => void;
}) {
  const [exaReady, setExaReady] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/exa")
      .then((r) => r.json())
      .then((d) => setExaReady(!!d.configured))
      .catch(() => setExaReady(false));
  }, []);

  async function connectExa() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/exa/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) return setError(d.error || "Failed to connect Exa.");
    setExaReady(true);
  }

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/idea-validation/run`, { method: "POST" });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error || "Validation failed.");
    onUpdated();
  }

  async function skip() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/idea-validation/skip`, { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError("Failed to skip.");
    onUpdated();
  }

  if (report) return <ReportView report={report} onRerun={run} busy={busy} />;

  if (!hasSpec) return <div className="card p-6 text-sm text-muted">Locked until the product spec is complete.</div>;

  if (exaReady === false) {
    return (
      <div className="card p-5 space-y-3">
        <h3 className="text-white font-medium">Connect Exa</h3>
        <p className="text-xs text-muted">
          Idea Validation searches real forum/community discussion via Exa to see what people actually say about the
          problem. Get a free key at exa.ai → API keys. Stored locally.
        </p>
        <input
          className="input"
          type="password"
          placeholder="Exa API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button className="btn-primary" disabled={busy || !apiKey} onClick={connectExa}>
          {busy ? "Connecting…" : "Connect Exa"}
        </button>
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
        <p className="text-xs text-warn">
          <span className="font-semibold">Optional step.</span> Building just for fun? You can skip this. But if you
          intend to <span className="font-semibold">make money</span> with this idea, we strongly recommend validating
          demand first — it’s cheap insurance against building something nobody wants.
        </p>
      </div>
      <p className="text-sm text-muted text-center">
        Search forums for real demand signal <span className="text-white/70">and</span> research the market —
        competitors, sizing, segments, positioning — then deliver an evidence-grounded verdict.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button className="btn-ghost" disabled={busy} onClick={skip} title="Skip validation and move on">
          Skip — just building for fun
        </button>
        <button className="btn-primary" disabled={busy || exaReady === null} onClick={run}>
          {busy ? "Searching forums & synthesizing… (~30s)" : "Run validation"}
        </button>
      </div>
      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

function ReportView({ report, onRerun, busy }: { report: ValidationReport; onRerun: () => void; busy: boolean }) {
  const v = VERDICT_STYLE[report.verdict] || VERDICT_STYLE.refine;
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted mb-2">{title}</div>
      {children}
    </div>
  );
  const List = ({ items }: { items: string[] }) => (
    <ul className="list-disc ml-5 space-y-0.5 text-sm text-white/85">
      {(items ?? []).map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${v.cls}`}>{v.label}</span>
            <span className="text-xs text-muted">
              confidence: {report.confidence} · demand {report.demand_signal}/10
            </span>
          </div>
          <button className="btn-ghost" disabled={busy} onClick={onRerun}>
            {busy ? "Re-running…" : "Re-run"}
          </button>
        </div>
        <p className="mt-3 text-sm text-white/90">{report.summary}</p>
      </div>

      <Section title="What people are saying">
        <div className="space-y-3">
          {report.themes.map((t, i) => (
            <div key={i}>
              <div className="text-sm text-white">{t.theme}</div>
              <div className="text-xs text-muted">{t.detail}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Real voices">
        <div className="space-y-3">
          {report.representative_quotes.map((q, i) => (
            <blockquote key={i} className="border-l-2 border-l-accent pl-3">
              <p className="text-sm text-white/90 italic">“{q.quote}”</p>
              <a href={q.url} target="_blank" rel="noreferrer" className="text-xs text-accent2 hover:underline">
                {q.source}
              </a>
            </blockquote>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Market overview">
          <p className="text-sm text-white/85">{report.market_overview}</p>
        </Section>
        <Section title="Market size">
          <p className="text-sm text-white/85">{report.market_size}</p>
        </Section>
      </div>

      <Section title="Competitive landscape">
        <div className="space-y-3">
          {report.competitive_landscape.map((c, i) => (
            <div key={i} className="rounded-lg border border-edge p-3">
              <div className="text-sm font-medium text-white">{c.name}</div>
              <div className="text-xs text-muted">{c.positioning}</div>
              <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                <span className="text-white/80">💪 {c.strengths}</span>
                <span className="text-accent2">🎯 Gap: {c.gaps}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Target segments">
          <ul className="space-y-1">
            {report.target_segments.map((s, i) => (
              <li key={i} className="text-sm">
                <span className="text-white">{s.segment}</span>
                <span className="block text-xs text-muted">{s.description}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Recommended positioning">
          <p className="text-sm text-white/85">{report.positioning}</p>
        </Section>
        <Section title="Pricing signal">
          <p className="text-sm text-white/85">{report.pricing_signal}</p>
        </Section>
        <Section title="Sentiment">
          <p className="text-sm text-white/85">{report.sentiment}</p>
        </Section>
        <Section title="Pain intensity">
          <p className="text-sm text-white/85">{report.pain_intensity}</p>
        </Section>
        <Section title="What must be true">
          <List items={report.what_must_be_true} />
        </Section>
        <Section title="Key risks">
          <List items={report.key_risks} />
        </Section>
        <Section title="Kill criteria">
          <List items={report.kill_criteria} />
        </Section>
      </div>

      <Section title="Recommendation">
        <p className="text-sm text-white/85">{report.recommendation}</p>
      </Section>

      {report.sources && report.sources.length > 0 && (
        <Section title={`Sources (${report.sources.length})`}>
          <ul className="space-y-1">
            {report.sources.map((s, i) => (
              <li key={i} className="text-xs">
                <a href={s.url} target="_blank" rel="noreferrer" className="text-accent2 hover:underline">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
