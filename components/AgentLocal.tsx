"use client";

import { useEffect, useState } from "react";

export interface LocalInfo {
  running: boolean;
  url?: string;
  mode: "chat" | "background" | "both";
  log?: string;
  personal: boolean;
  tested: boolean;
  online: boolean;
}

const PAGE: Record<LocalInfo["mode"], string> = {
  chat: "a chat page",
  background: "a run page (Run now, a schedule, and past runs)",
  both: "a chat page with a Runs tab",
};

export function useLocalAgent(projectId: string) {
  const [info, setInfo] = useState<LocalInfo | null>(null);
  const load = () =>
    fetch(`/api/projects/${projectId}/deploy/local`).then((r) => r.json()).then((d) => !d.error && setInfo(d)).catch(() => {});
  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { info, reload: load };
}

/**
 * "On your computer": start the agent on this computer and open its own page (a separate tab at its own
 * address, never inside the pipeline). Every agent is tested here first.
 */
export function AgentLocalSection({ projectId, info, onChanged }: { projectId: string; info: LocalInfo; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; log?: string } | null>(null);

  async function act(action: "start" | "stop", label: string) {
    setBusy(label);
    setError(null);
    const d = await fetch(`/api/projects/${projectId}/deploy/local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).then((r) => r.json()).catch(() => ({ error: "Couldn't reach the pipeline." }));
    setBusy(null);
    if (d.error) setError({ message: d.error, log: d.log });
    else if (action === "start" && d.url) window.open(d.url, "_blank", "noopener");
    onChanged();
  }

  return (
    <div className="space-y-3 rounded-xl border border-edge bg-ink/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${info.running ? "bg-ok" : "bg-edge"}`} />
        <span className="flex-1 text-sm font-semibold text-fg">{info.running ? "Running on your computer" : "Not running"}</span>
        {info.running ? (
          <>
            <a className="btn-primary" href={info.url} target="_blank" rel="noopener noreferrer">Open your agent ↗</a>
            <button className="btn btn-ghost" disabled={!!busy} onClick={() => act("stop", "Stopping…")}>Stop</button>
          </>
        ) : (
          <button className="btn-primary" disabled={!!busy} onClick={() => act("start", "Starting your agent (the first time can take a minute)…")}>
            {busy ?? "Start your agent"}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        Your agent runs on this computer with its own page: {PAGE[info.mode]}. It opens in a new tab, separate from this app, and it
        uses your real keys and tools. Actions that need your OK wait for you to approve them.
        {info.mode !== "chat" && " Scheduled runs happen while this computer is awake."}
      </p>
      {info.running && info.url && <p className="text-xs text-muted">Address: <span className="font-mono">{info.url}</span> (only this computer can open it)</p>}
      {busy && info.running && <p className="text-sm text-accent2">{busy}</p>}
      {error && (
        <div className="text-sm text-bad">
          {error.message}
          {error.log && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-muted">What it printed</summary>
              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap text-[11px] text-fg/80">{error.log}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
