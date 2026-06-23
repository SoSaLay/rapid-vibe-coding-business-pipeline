"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInput } from "./VoiceInput";
import { FolderUpload } from "./FolderUpload";

/**
 * Idea capture — three ways in:
 *  • Speak or type a fresh idea
 *  • Import an existing GitHub repo (brownfield)
 *  • Pull an existing project folder from this computer (brownfield, local)
 * Idea-type labeling now happens later, per-idea, on the home list.
 */
export function IdeaCapture({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<"direct" | "github" | "files">("direct");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct entry
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);

  // GitHub import
  const [repoUrl, setRepoUrl] = useState("");
  const [repoToken, setRepoToken] = useState("");

  // Local-folder import
  const [folderFiles, setFolderFiles] = useState<FileList | null>(null);

  const [importStatus, setImportStatus] = useState<string | null>(null);

  async function submitDirect() {
    if (!text.trim()) return setError("Speak or type your idea first.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text, inputMethod: usedVoice ? "voice" : "text" }),
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

  async function submitImport() {
    if (!repoUrl.trim()) return setError("Paste a GitHub repository URL first.");
    setBusy(true);
    setError(null);
    setImportStatus("Cloning the repo and reading the code… this can take a minute.");
    const res = await fetch("/api/ideas/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: repoUrl.trim(), token: repoToken.trim() || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setImportStatus(null);
    if (!res.ok) return setError(d.error || "Failed to import the repository.");
    setRepoUrl("");
    setRepoToken("");
    if (d.project?.id) router.push(`/project/${d.project.id}`);
    else onCreated();
  }

  async function submitUploadedFolder() {
    if (!folderFiles) return setError("Select a project folder to upload.");
    setBusy(true);
    setError(null);
    setImportStatus("Uploading the folder and reading the code… this can take a minute.");

    const formData = new FormData();
    for (let i = 0; i < folderFiles.length; i++) {
      formData.append("files", folderFiles[i]);
    }

    const res = await fetch("/api/ideas/import-local-upload", {
      method: "POST",
      body: formData,
    });

    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setImportStatus(null);
    if (!res.ok) return setError(d.error || "Failed to import the folder.");
    setFolderFiles(null);
    if (d.project?.id) router.push(`/project/${d.project.id}`);
    else onCreated();
  }

  return (
    <div className="card p-5">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <TabButton active={tab === "direct"} onClick={() => setTab("direct")}>🎙️ Speak or type</TabButton>
        <TabButton active={tab === "github"} onClick={() => setTab("github")}>🐙 Use GitHub repo</TabButton>
        <TabButton active={tab === "files"} onClick={() => setTab("files")}>📁 Upload projects</TabButton>
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

      {tab === "github" && (
        <div className="space-y-3">
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
                Public repos need no token. For private repos, create a fine-grained token with{" "}
                <span className="text-fg/70">Repository → Contents: Read-only</span>.
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

      {tab === "files" && (
        <div className="space-y-3">
          <FolderUpload onFolderSelect={setFolderFiles} />
          {importStatus && <p className="text-[11px] text-accent2">{importStatus}</p>}
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy || !folderFiles} onClick={submitUploadedFolder}>
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
    <button onClick={onClick} className={`btn ${active ? "btn-primary" : "btn-ghost"}`}>
      {children}
    </button>
  );
}
