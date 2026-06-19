"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IdeaCapture } from "@/components/IdeaCapture";
import { PhaseRail } from "@/components/PhaseRail";
import { ThemeToggle } from "@/components/ThemeToggle";

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

  return (
    <main className="paper mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Rapid Vibe Coding Pipeline</h1>
          <p className="mt-1 text-sm text-muted">From a spoken idea to a shipped, marketed product — one phase at a time.</p>
        </div>
        <ThemeToggle className="mt-1 shrink-0" />
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
                <Link
                  key={p.id}
                  href={`/project/${p.id}`}
                  className="card flex items-center justify-between p-4 hover:border-accent transition-colors"
                >
                  <div>
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
                  </div>
                  <span className="rounded-full bg-edge px-3 py-1 text-xs text-muted">Open →</span>
                </Link>
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
                      <button
                        onClick={() => unarchive(p.id)}
                        className="rounded-full bg-edge px-3 py-1 text-xs text-muted hover:text-fg"
                      >
                        Unarchive
                      </button>
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
