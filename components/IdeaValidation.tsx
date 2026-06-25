"use client";

import { useEffect, useState } from "react";
import { Interject } from "./Interject";
import { StopButton, useStopper } from "./StopButton";
import { Doc, DocSection, DocP, DocSub, DocMuted, DocList, DocQuote } from "./doc/Doc";

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
  build: { label: "Build it", cls: "text-onbright bg-ok" },
  refine: { label: "Refine first", cls: "text-onbright bg-warn" },
  reject: { label: "Reject", cls: "text-fg bg-bad" },
  archive: { label: "Archive", cls: "text-fg bg-edge" },
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
  const stopper = useStopper();

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
    try {
      const res = await fetch(`/api/projects/${projectId}/idea-validation/run`, { method: "POST", signal: stopper.signal() });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) return setError(d.error || "Validation failed.");
      onUpdated();
    } catch (e: any) {
      setBusy(false);
      if (!stopper.isAbort(e)) setError(e?.message || "Validation failed.");
    }
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
        <h3 className="text-fg font-medium">Connect Exa</h3>
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
        Search forums for real demand signal <span className="text-fg/70">and</span> research the market —
        competitors, sizing, segments, positioning — then deliver an evidence-grounded verdict.
      </p>
      <Interject projectId={projectId} phase="idea-validation" />
      <div className="flex items-center justify-center gap-3">
        <button className="btn-ghost" disabled={busy} onClick={skip} title="Skip validation and move on">
          Skip — just building for fun
        </button>
        <button className="btn-primary" disabled={busy || exaReady === null} onClick={run}>
          {busy ? "Searching forums & synthesizing… (~30s)" : "Run validation"}
        </button>
        {busy && <StopButton onStop={stopper.stop} />}
      </div>
      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

function ReportView({ report, onRerun, busy }: { report: ValidationReport; onRerun: () => void; busy: boolean }) {
  const v = VERDICT_STYLE[report.verdict] || VERDICT_STYLE.refine;

  return (
    <Doc>
      {/* ───────────── Verdict — the decision, up top ───────────── */}
      <DocSection title="Verdict">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${v.cls}`}>{v.label}</span>
            <span className="doc-muted">
              confidence: {report.confidence} · demand {report.demand_signal}/10
            </span>
          </div>
          <button className="btn-ghost" disabled={busy} onClick={onRerun}>
            {busy ? "Re-running…" : "Re-run"}
          </button>
        </div>
        <DocP className="mt-5 text-[1.2rem] leading-relaxed">{report.summary}</DocP>

        <div className="mt-8 space-y-8">
          <div>
            <DocSub>Recommendation</DocSub>
            <DocP className="mt-1">{report.recommendation}</DocP>
          </div>
          <div>
            <DocSub>What must be true</DocSub>
            <div className="mt-1">
              <DocList items={report.what_must_be_true} />
            </div>
          </div>
          <div>
            <DocSub>Key risks</DocSub>
            <div className="mt-1">
              <DocList items={report.key_risks} />
            </div>
          </div>
          <div>
            <DocSub>Kill criteria</DocSub>
            <div className="mt-1">
              <DocList items={report.kill_criteria} />
            </div>
          </div>
        </div>
      </DocSection>

      {/* ───────────── Demand signal — what people actually want ───────────── */}
      <DocSection title="Demand signal">
        <div className="space-y-10">
          <div>
            <DocSub>What people are saying</DocSub>
            <div className="mt-3 space-y-5">
              {report.themes.map((t, i) => (
                <div key={i}>
                  <p className="font-medium text-fg">{t.theme}</p>
                  <DocMuted className="mt-0.5">{t.detail}</DocMuted>
                </div>
              ))}
            </div>
          </div>

          <div>
            <DocSub>Real voices</DocSub>
            <div className="mt-3 space-y-5">
              {report.representative_quotes.map((q, i) => (
                <DocQuote key={i} quote={q.quote} source={q.source} url={q.url} />
              ))}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <DocSub>Sentiment</DocSub>
              <DocP className="mt-1">{report.sentiment}</DocP>
            </div>
            <div>
              <DocSub>Pain intensity</DocSub>
              <DocP className="mt-1">{report.pain_intensity}</DocP>
            </div>
          </div>
        </div>
      </DocSection>

      {/* ───────────── Market & competitors — the landscape ───────────── */}
      <DocSection title="Market & competitors">
        <div className="space-y-10">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <DocSub>Market overview</DocSub>
              <DocP className="mt-1">{report.market_overview}</DocP>
            </div>
            <div>
              <DocSub>Market size</DocSub>
              <DocP className="mt-1">{report.market_size}</DocP>
            </div>
          </div>

          <div>
            <DocSub>Competitive landscape</DocSub>
            <div className="mt-3 space-y-6">
              {report.competitive_landscape.map((c, i) => (
                <div key={i}>
                  <p className="font-medium text-fg">{c.name}</p>
                  <DocMuted className="mt-0.5">{c.positioning}</DocMuted>
                  <DocP className="mt-2">
                    <span className="font-semibold text-fg">Strengths. </span>
                    {c.strengths}
                  </DocP>
                  <DocP className="mt-1 text-accent2">
                    <span className="font-semibold">Gap. </span>
                    {c.gaps}
                  </DocP>
                </div>
              ))}
            </div>
          </div>

          <div>
            <DocSub>Target segments</DocSub>
            <div className="mt-3 space-y-4">
              {report.target_segments.map((s, i) => (
                <div key={i}>
                  <p className="font-medium text-fg">{s.segment}</p>
                  <DocMuted className="mt-0.5">{s.description}</DocMuted>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <DocSub>Recommended positioning</DocSub>
              <DocP className="mt-1">{report.positioning}</DocP>
            </div>
            <div>
              <DocSub>Pricing signal</DocSub>
              <DocP className="mt-1">{report.pricing_signal}</DocP>
            </div>
          </div>
        </div>
      </DocSection>

      {report.sources && report.sources.length > 0 && (
        <DocSection title="Sources">
          <ul className="space-y-2">
            {report.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-accent2 hover:underline">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </DocSection>
      )}
    </Doc>
  );
}
