"use client";

import { useEffect, useState } from "react";
import { Doc, DocSection, DocMuted, DocFacts } from "./doc/Doc";
import type { HostedOpsSummary } from "@/lib/agent/hosted/ops";

const sec = (n: number | null) => (n === null ? "—" : n < 60 ? `${n.toFixed(1)}s` : `${(n / 60).toFixed(1)}m`);

/**
 * Operations for an agent on Claude or ChatGPT: how it's doing (from the platform's own records of its real
 * conversations), what it is, and a way to its settings on the platform (where it can be changed or deleted).
 */
export function HostedOperations({ projectId, platform }: { projectId: string; platform: "claude" | "chatgpt" }) {
  const name = platform === "claude" ? "Claude" : "ChatGPT";
  const [days, setDays] = useState(7);
  const [s, setS] = useState<HostedOpsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${projectId}/hosted/ops?platform=${platform}&days=${days}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setS(d)))
      .catch(() => setError("Couldn't load the agent's runs."))
      .finally(() => setLoading(false));
  }, [projectId, platform, days]);

  return (
    <Doc>
      <DocSection title="How it's doing">
        <div className="mb-3 flex flex-wrap gap-2">
          {[1, 7, 30, 90].map((n) => (
            <button
              key={n}
              className={`rounded-md border px-3 py-1 text-xs ${days === n ? "border-accent/60 text-fg" : "border-edge text-muted"}`}
              onClick={() => setDays(n)}
            >
              {n === 1 ? "Today" : `${n} days`}
            </button>
          ))}
        </div>
        {error ? (
          <p className="text-sm text-bad">{error}</p>
        ) : !s ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
              {[
                ["Runs", String(s.runs)],
                ["Speed p50 / p95", `${sec(s.latency_p50)} / ${sec(s.latency_p95)}`],
                ["Cost", s.cost !== null ? `$${s.cost.toFixed(2)}` : "—"],
                ["Cost per run", s.cost_per_run !== null ? `$${s.cost_per_run.toFixed(4)}` : "—"],
                ["Hand-offs", String(s.handoffs)],
                ["Waiting for approval", String(s.awaiting_approval)],
                ["Runs with a tool error", String(s.tool_error_runs)],
                ["Tool calls per run", s.avg_tool_calls !== null ? s.avg_tool_calls.toFixed(1) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-edge p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
                  <div className="mt-1 text-lg font-semibold text-fg">{value}</div>
                </div>
              ))}
            </div>
            <DocMuted className="mt-3">
              From {name}&apos;s records of the agent&apos;s real conversations (the pipeline&apos;s own tests aren&apos;t counted).
              {s.sampled < s.runs ? ` Hand-offs, approval waits, tool errors and tool calls are from the latest ${s.sampled} runs.` : ""}
            </DocMuted>
          </>
        )}
      </DocSection>

      {s && (
        <DocSection title="Agent information">
          <DocFacts
            items={[
              { label: "Runs on", value: name },
              { label: "Agent id", value: s.agent_id },
              ...(s.agent_version !== undefined ? [{ label: "Version", value: String(s.agent_version) }] : []),
              { label: "Model", value: s.model.split(":")[1] ?? s.model },
              { label: "Built", value: new Date(s.built_at).toLocaleString() },
            ]}
          />
          {s.agent_url && (
            <a className="btn-primary mt-4 inline-block text-sm" href={s.agent_url} target="_blank" rel="noreferrer">
              Agent settings on {name} ↗
            </a>
          )}
          <DocMuted className="mt-2">Change, pause or delete the agent there, and see every conversation it has had.</DocMuted>
        </DocSection>
      )}
    </Doc>
  );
}
