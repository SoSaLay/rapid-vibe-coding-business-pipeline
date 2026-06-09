"use client";

import { useEffect, useState } from "react";
import { VoiceInput } from "./VoiceInput";

interface ConnectorInfo {
  id: string;
  name: string;
  status: "active" | "coming_soon";
  authKind: string;
  configured: boolean;
}

interface Source {
  id: string;
  title: string;
  type: string;
  url?: string;
}

export function IdeaCapture({ onCreated }: { onCreated: () => void }) {
  const [tab, setTab] = useState<"direct" | "pull">("direct");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct entry
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);

  // Pull from tool
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [activeConnector, setActiveConnector] = useState<string>("notion");
  const [token, setToken] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);

  useEffect(() => {
    if (tab === "pull") loadConnectors();
  }, [tab]);

  async function loadConnectors() {
    const res = await fetch("/api/connectors");
    const data = await res.json();
    setConnectors(data.connectors || []);
    const notion = data.connectors?.find((c: ConnectorInfo) => c.id === "notion");
    if (notion?.configured) loadSources("notion");
  }

  async function connectNotion() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/connectors/notion/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentials: { token } }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) return setError(data.error || "Failed to connect.");
    await loadConnectors();
  }

  async function loadSources(connectorId: string) {
    setError(null);
    const res = await fetch(`/api/connectors/${connectorId}/sources`);
    const data = await res.json();
    if (data.error && !data.sources?.length) setError(data.error);
    setSources(data.sources || []);
  }

  async function submitDirect() {
    if (!text.trim()) return setError("Speak or type your idea first.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "direct", title, text, inputMethod: usedVoice ? "voice" : "text" }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.error || "Failed to capture idea.");
    }
    setTitle("");
    setText("");
    onCreated();
  }

  async function submitPull() {
    if (!selectedSource) return setError("Pick a page or database first.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "pull", connector: activeConnector, sourceId: selectedSource.id, title }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.error || "Failed to pull idea.");
    }
    setSelectedSource(null);
    setTitle("");
    onCreated();
  }

  const notion = connectors.find((c) => c.id === "notion");
  const visibleSources = sources.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-5">
        <TabButton active={tab === "direct"} onClick={() => setTab("direct")}>
          🎙️ Speak or type
        </TabButton>
        <TabButton active={tab === "pull"} onClick={() => setTab("pull")}>
          🔗 Pull from a tool
        </TabButton>
      </div>

      {tab === "direct" && (
        <div className="space-y-3">
          <input
            className="input"
            placeholder="Idea title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <VoiceInput
              onTranscript={(t) => {
                setText(t);
                setUsedVoice(true);
              }}
            />
            <span className="text-xs text-muted">…or just type below</span>
          </div>
          <textarea
            className="input min-h-[140px] resize-y"
            placeholder="What's the idea? Describe the problem, who it's for, and what you imagine building."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy} onClick={submitDirect}>
              {busy ? "Capturing…" : "Capture idea →"}
            </button>
          </div>
        </div>
      )}

      {tab === "pull" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => (
              <button
                key={c.id}
                onClick={() => c.status === "active" && setActiveConnector(c.id)}
                disabled={c.status !== "active"}
                className={`btn ${
                  activeConnector === c.id && c.status === "active"
                    ? "btn-primary"
                    : "btn-ghost"
                } ${c.status !== "active" ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {c.name}
                {c.status !== "active" && <span className="text-[10px]">soon</span>}
              </button>
            ))}
          </div>

          {activeConnector === "notion" && !notion?.configured && (
            <div className="space-y-2 rounded-lg border border-edge bg-ink p-4">
              <p className="text-sm text-white">Connect Notion</p>
              <p className="text-xs text-muted">
                Create an internal integration at notion.so/my-integrations, share your target pages/databases with it,
                then paste the secret here.
              </p>
              <input
                className="input"
                type="password"
                placeholder="Internal Integration Secret (ntn_…)"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button className="btn-primary" disabled={busy || !token} onClick={connectNotion}>
                {busy ? "Connecting…" : "Connect"}
              </button>
            </div>
          )}

          {notion?.configured && activeConnector === "notion" && (
            <div className="space-y-3">
              <input
                className="input"
                placeholder="Filter pages / databases…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div className="max-h-64 overflow-auto rounded-lg border border-edge divide-y divide-edge">
                {visibleSources.length === 0 && (
                  <p className="p-3 text-xs text-muted">
                    No sources found. Make sure pages/databases are shared with your integration.
                  </p>
                )}
                {visibleSources.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSource(s)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-edge/40 ${
                      selectedSource?.id === s.id ? "bg-accent/15" : ""
                    }`}
                  >
                    <span className="text-muted">{s.type === "database" ? "🗄️" : "📄"}</span>
                    <span className="flex-1 text-white">{s.title}</span>
                    {selectedSource?.id === s.id && <span className="text-accent2 text-xs">selected</span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">
                  {selectedSource ? `Will ingest: ${selectedSource.title}` : "Pick a source to kick off the pipeline"}
                </span>
                <button className="btn-primary" disabled={busy || !selectedSource} onClick={submitPull}>
                  {busy ? "Pulling…" : "Use this →"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
    >
      {children}
    </button>
  );
}
