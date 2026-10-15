"use client";

import { useEffect, useState } from "react";
import { Interject } from "./Interject";
import { StopButton, useStopper } from "./StopButton";
import { Doc, DocSection, DocSub, DocMuted, DocList, DocQuote, DocProse, DocFacts, DocChips, DocDetails, firstSentence } from "./doc/Doc";

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

  const themes = report.themes ?? [];
  const quotes = report.representative_quotes ?? [];
  const competitors = report.competitive_landscape ?? [];

  // Two headings: the call (verdict + the demand behind it) and the market it
  // lands in. The supporting evidence stays one toggle away.
  return (
    <Doc>
      <DocSection title="Verdict & demand">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${v.cls}`}>{v.label}</span>
            <DocChips
              items={[
                `Demand ${report.demand_signal}/10`,
                report.confidence && `Confidence: ${report.confidence}`,
                // A chip is a phrase; reports from before the length caps wrote a paragraph here.
                report.pain_intensity?.length <= 60 && `Pain: ${report.pain_intensity}`,
              ]}
            />
          </div>
          <button className="btn-ghost" disabled={busy} onClick={onRerun}>
            {busy ? "Re-running…" : "Re-run"}
          </button>
        </div>
        <div className="mt-5">
          <DocProse text={firstSentence(report.summary)} tone="lede" />
        </div>
        <DocFacts
          items={[
            { label: "Next move", value: firstSentence(report.recommendation) },
            { label: "Stop if", value: (report.kill_criteria ?? []).slice(0, 2).join(" · ") },
          ]}
        />

        {themes.length > 0 && (
          <div className="mt-8">
            <DocSub>What people are saying</DocSub>
            <div className="mt-1">
              <DocList items={themes.slice(0, 3).map((t) => t.theme)} />
            </div>
          </div>
        )}
        {quotes.length > 0 && (
          <div className="mt-6 space-y-5">
            {quotes.slice(0, 2).map((q, i) => (
              <DocQuote key={i} quote={q.quote} source={q.source} url={q.url} />
            ))}
          </div>
        )}
      </DocSection>

      <DocSection title="Market">
        <DocFacts
          items={[
            { label: "Market size", value: firstSentence(report.market_size) },
            { label: "Price signal", value: <span className="text-accent2">{firstSentence(report.pricing_signal)}</span> },
            { label: "Your angle", value: firstSentence(report.positioning) },
          ]}
        />
        {competitors.length > 0 && (
          <div className="mt-8">
            <DocSub>Competitors — and the gap they leave</DocSub>
            <DocFacts items={competitors.map((c) => ({ label: c.name, value: c.gaps }))} />
          </div>
        )}
      </DocSection>

      <DocDetails>
        {(
          [
            ["What must be true", report.what_must_be_true],
            ["Key risks", report.key_risks],
            ["Kill criteria", report.kill_criteria],
          ] as [string, string[] | undefined][]
        )
          .filter(([, items]) => (items ?? []).length > 0)
          .map(([label, items]) => (
            <div key={label}>
              <DocSub>{label}</DocSub>
              <div className="mt-1">
                <DocList items={items ?? []} />
              </div>
            </div>
          ))}
        {themes.length > 0 && (
          <div>
            <DocSub>Demand themes</DocSub>
            <DocFacts items={themes.map((t) => ({ label: t.theme, value: t.detail }))} />
          </div>
        )}
        {quotes.length > 2 && (
          <div>
            <DocSub>More voices</DocSub>
            <div className="mt-3 space-y-5">
              {quotes.slice(2).map((q, i) => (
                <DocQuote key={i} quote={q.quote} source={q.source} url={q.url} />
              ))}
            </div>
          </div>
        )}
        {report.market_overview && (
          <div>
            <DocSub>Market overview</DocSub>
            <div className="mt-1">
              <DocProse text={report.market_overview} />
            </div>
          </div>
        )}
        {competitors.length > 0 && (
          <div>
            <DocSub>Competitors in full</DocSub>
            <div className="mt-3 space-y-4">
              {competitors.map((c, i) => (
                <div key={i}>
                  <p className="font-medium text-fg">{c.name}</p>
                  <DocMuted className="mt-0.5">{c.positioning}</DocMuted>
                  <DocMuted className="mt-0.5">Strengths: {c.strengths}</DocMuted>
                </div>
              ))}
            </div>
          </div>
        )}
        {(report.target_segments ?? []).length > 0 && (
          <div>
            <DocSub>Target segments</DocSub>
            <DocFacts items={report.target_segments.map((s) => ({ label: s.segment, value: s.description }))} />
          </div>
        )}
        {report.sources && report.sources.length > 0 && (
          <div>
            <DocSub>Sources</DocSub>
            <ul className="mt-2 space-y-2 text-sm">
              {report.sources.map((s, i) => (
                <li key={i}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent2 hover:underline">
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DocDetails>
    </Doc>
  );
}
