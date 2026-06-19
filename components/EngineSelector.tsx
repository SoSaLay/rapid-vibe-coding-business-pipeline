"use client";

import { useEffect, useState } from "react";

const ENGINES = [
  { id: "google-stitch", label: "Google", sub: "Stitch · Gemini" },
  { id: "claude-html", label: "Claude", sub: "HTML" },
];

/**
 * Pipeline-wide choice of which AI builds the UI screens. Stored on the project
 * (settings.designEngine) and honored everywhere. Google is the default;
 * Claude is always usable. Image generation is Google-only regardless.
 */
export function EngineSelector({ projectId }: { projectId: string }) {
  const [engine, setEngine] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/settings`)
      .then((r) => r.json())
      .then((d) => setEngine(d.designEngine || "google-stitch"))
      .catch(() => setEngine("google-stitch"));
    fetch("/api/google")
      .then((r) => r.json())
      .then((d) => setGoogleReady(!!d.configured))
      .catch(() => setGoogleReady(false));
  }, [projectId]);

  async function choose(id: string) {
    if (id === engine) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designEngine: id }),
    });
    setBusy(false);
    if (res.ok) setEngine(id);
  }

  if (engine === null) return null;
  const needsGoogle = engine === "google-stitch" && googleReady === false;

  return (
    <div className="rounded-lg border border-edge bg-edge/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wider text-muted">UI generation model</div>
        <div className="inline-flex overflow-hidden rounded-lg border border-edge">
          {ENGINES.map((e) => {
            const active = e.id === engine;
            return (
              <button
                key={e.id}
                disabled={busy}
                onClick={() => choose(e.id)}
                className={`px-3 py-1.5 text-left transition-colors ${
                  active ? "bg-accent2/20 text-fg" : "text-muted hover:bg-edge/40"
                }`}
              >
                <span className="block text-xs font-medium leading-tight">{e.label}</span>
                <span className="block text-[10px] leading-tight opacity-70">{e.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-muted">
        Applies to the whole pipeline’s UI screens. Default is Google.{" "}
        {needsGoogle
          ? "Connect Google below to actually use it — Claude builds the UI until then."
          : "Brand images (logo, hero, campaign art) always use Google."}
      </p>
    </div>
  );
}
