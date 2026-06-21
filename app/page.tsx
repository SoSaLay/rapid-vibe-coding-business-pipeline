"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IdeaCapture } from "@/components/IdeaCapture";
import { PhaseRail } from "@/components/PhaseRail";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OnboardingButton, useOnboarding } from "@/components/Onboarding";

interface Project {
  id: string;
  title: string;
  created_at: string;
  current_phase: string;
  cycle?: number;
  archived?: boolean;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const { status: onboarding, reload: reloadOnboarding } = useOnboarding();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/ideas");
    const data = await res.json();
    setProjects(data.projects || []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  async function unarchive(id: string) {
    await fetch(`/api/projects/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    refresh();
  }

  async function archiveProject(id: string) {
    await fetch(`/api/projects/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    refresh();
  }

  return (
    <main className="paper mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Rapid Vibe Coding Business Pipeline</h1>
          <p className="mt-1 text-sm text-muted">From a spoken idea to a shipped, marketed product — one phase at a time.</p>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-2">
          <OnboardingButton status={onboarding} reload={reloadOnboarding} highlight={!onboarding?.requiredComplete} />
          <ThemeToggle />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="order-last lg:order-first lg:sticky lg:top-8 lg:self-start">
          <PhaseRail activeId="business-owner" />
        </aside>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">Phase 1 · Business Owner</h2>
            <IdeaCapture onCreated={refresh} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
              Captured ideas ({active.length})
            </h2>
            <div className="space-y-2">
              {active.length === 0 && (
                <div className="card p-6 text-center text-sm text-muted">
                  No ideas yet. Speak one, type one, or pull one from Notion to start the pipeline.
                </div>
              )}
              {active.map((p) => (
                <div
                  key={p.id}
                  className="card flex items-center justify-between gap-3 p-4 hover:border-accent transition-colors"
                >
                  <Link href={`/project/${p.id}`} className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">
                      {p.title}
                      {(p.cycle ?? 1) > 1 && (
                        <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                          Cycle {p.cycle}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(p.created_at).toLocaleString()} · at {p.current_phase}
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => archiveProject(p.id)}
                      className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-fg"
                    >
                      Archive
                    </button>
                    <DeleteIdea id={p.id} title={p.title} onDeleted={refresh} />
                    <Link
                      href={`/project/${p.id}`}
                      className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-fg"
                    >
                      Open →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {archived.length > 0 && (
            <section>
              <button
                onClick={() => setShowArchived((s) => !s)}
                className="mb-3 text-sm font-medium uppercase tracking-wider text-muted hover:text-fg"
              >
                Archived ({archived.length}) {showArchived ? "▲" : "▼"}
              </button>
              {showArchived && (
                <div className="space-y-2">
                  {archived.map((p) => (
                    <div key={p.id} className="card flex items-center justify-between p-4 opacity-70">
                      <Link href={`/project/${p.id}`} className="min-w-0">
                        <div className="text-sm font-medium text-fg">{p.title}</div>
                        <div className="text-xs text-muted">
                          {new Date(p.created_at).toLocaleString()} · archived
                        </div>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => unarchive(p.id)}
                          className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-fg"
                        >
                          Unarchive
                        </button>
                        <DeleteIdea id={p.id} title={p.title} onDeleted={refresh} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Permanent-delete control with a type-the-name second factor. Collapsed to a
 * small "Delete" button; expands into a confirm panel where the exact idea title
 * must be typed before the irreversible delete is enabled.
 */
function DeleteIdea({ id, title, onDeleted }: { id: string; title: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirm.trim() === title.trim();

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmTitle: confirm.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.error || "Failed to delete.");
    }
    onDeleted();
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-bad"
      >
        Delete
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-lg border border-bad/40 bg-paper p-3 text-left shadow-lg">
      <p className="text-xs text-fg">
        Permanently delete this idea and <span className="font-medium">all its data</span>? This can’t be undone.
      </p>
      <p className="mt-2 text-[11px] text-muted">
        Type <span className="font-medium text-fg">{title}</span> to confirm:
      </p>
      <input
        autoFocus
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={title}
        className="input mt-1 text-xs"
      />
      {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={() => {
            setOpen(false);
            setConfirm("");
            setError(null);
          }}
          className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-fg"
        >
          Cancel
        </button>
        <button
          onClick={remove}
          disabled={!matches || busy}
          className="rounded-full bg-bad px-3 py-1 text-xs text-onbright disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
        </div>
      )}
    </span>
  );
}
