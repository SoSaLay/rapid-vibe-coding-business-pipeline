"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "./VoiceInput";
import { IDEA_TYPES } from "@/lib/idea-types";

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
  const router = useRouter();
  const [tab, setTab] = useState<"direct" | "pull" | "github">("direct");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideaType, setIdeaType] = useState("web-app");

  // GitHub import
  const [repoUrl, setRepoUrl] = useState("");
  const [repoToken, setRepoToken] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

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
      body: JSON.stringify({ mode: "direct", title, text, inputMethod: usedVoice ? "voice" : "text", ideaType }),
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
      body: JSON.stringify({ mode: "pull", connector: activeConnector, sourceId: selectedSource.id, title, ideaType }),
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

  async function submitImport() {
    if (!repoUrl.trim()) return setError("Paste a GitHub repository URL first.");
    setBusy(true);
    setError(null);
    setImportStatus("Cloning the repo and reading the code… this can take a minute.");
    const res = await fetch("/api/ideas/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: repoUrl.trim(), token: repoToken.trim() || undefined, ideaType }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setImportStatus(null);
    if (!res.ok) return setError(d.error || "Failed to import the repository.");
    setRepoUrl("");
    setRepoToken("");
    // Kick straight into the imported project's pipeline.
    if (d.project?.id) router.push(`/project/${d.project.id}`);
    else onCreated();
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
        <TabButton active={tab === "github"} onClick={() => setTab("github")}>
          🐙 Use GitHub repo
        </TabButton>
      </div>

      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wider text-muted mb-1.5">What kind of idea is this?</div>
        <div className="flex flex-wrap gap-1.5">
          {IDEA_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setIdeaType(t.id)}
              title={t.blurb}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                ideaType === t.id
                  ? "border-accent2 bg-accent2/15 text-fg"
                  : "border-edge text-muted hover:text-fg hover:bg-edge/30"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">{IDEA_TYPES.find((t) => t.id === ideaType)?.blurb}</p>
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
              <p className="text-sm text-fg">Connect Notion</p>
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
                    <span className="flex-1 text-fg">{s.title}</span>
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

      {tab === "github" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-accent2/30 bg-accent2/5 p-3">
            <p className="text-xs text-fg/85">
              Already built something? Paste its GitHub URL. We clone it into your app workspace, detect the stack, and the
              AI reverse-engineers a product spec from the code — then drops you at the <span className="text-accent2">Engineering</span>{" "}
              phase with QA, Deployment, Marketing, Ops & Iteration all unlocked, so you can iterate on top of it.
            </p>
          </div>
          <input
            className="input"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
          <details className="rounded-lg border border-edge bg-edge/10 p-3">
            <summary className="cursor-pointer text-xs text-muted">Importing a private repo? Add a GitHub token</summary>
            <div className="mt-2 space-y-2">
              <input
                className="input text-xs"
                type="password"
                placeholder="GitHub token (github_pat_… or ghp_…)"
                value={repoToken}
                onChange={(e) => setRepoToken(e.target.value)}
              />
              <p className="text-[11px] text-muted">
                Public repos need no token. For private repos, create a fine-grained token at{" "}
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent2 hover:text-fg"
                >
                  github.com/settings/personal-access-tokens
                </a>{" "}
                with <span className="text-fg/70">Repository → Contents: Read-only</span>. Paste it here when you import a
                private repo.
              </p>
            </div>
          </details>
          {importStatus && <p className="text-[11px] text-accent2">{importStatus}</p>}
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy || !repoUrl.trim()} onClick={submitImport}>
              {busy ? "Importing…" : "Import & start pipeline →"}
            </button>
          </div>
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
