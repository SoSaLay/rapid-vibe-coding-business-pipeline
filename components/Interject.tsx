"use client";

import { useEffect, useState } from "react";

interface Interjection {
  raw: string;
  refined: string;
  at: string;
}

/**
 * Business-owner interjection input (#8). A collapsible note box on any generate-capable
 * phase. The raw note goes to the Product Owner, who refines it into a directive that the
 * phase's next generation honors. Shows the refined directives already in effect.
 */
export function Interject({ projectId, phase }: { projectId: string; phase: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Interjection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/interject?phase=${encodeURIComponent(phase)}`)
      .then((r) => r.json())
      .then((d) => setItems(d.interjections || []))
      .catch(() => {});
  }, [projectId, phase]);

  async function send() {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/interject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, note }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error || "Couldn't process that note.");
    setItems((prev) => [...prev, d.interjection]);
    setNote("");
  }

  return (
    <div className="rounded-lg border border-edge bg-edge/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-muted">Interject as Business Owner</div>
        <button className="text-[11px] text-accent2 hover:text-fg" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : items.length ? `Add another (${items.length})` : "Add a note"}
        </button>
      </div>

      {items.length > 0 && (
        <ul className="mt-2 space-y-1">
          {items.map((i, n) => (
            <li key={n} className="flex items-start gap-2 text-[11px] text-fg/80">
              <span className="text-accent2">↳</span>
              <span>{i.refined}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted">
            Steer this step — a constraint, tone, or focus. The Product Owner refines it before it feeds the next
            generation.
          </p>
          <textarea
            className="input min-h-[64px] resize-y text-sm"
            placeholder="e.g. 'Make the tone more casual' or 'Focus on enterprise customers, not consumers'"
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="text-[11px] text-bad">{error}</p>}
          <button className="btn-primary text-xs" disabled={busy || !note.trim()} onClick={send}>
            {busy ? "Product Owner is refining…" : "Send to Product Owner"}
          </button>
        </div>
      )}
    </div>
  );
}
