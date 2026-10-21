"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "@/lib/phases/agent-design-chat";

const OPEN_KEY = "agent-builder-open";

/**
 * The Automatic Agent Changer: a tall tab on the right edge opens a full-height side panel
 * (Copilot Studio style), messages above and the input pinned at the bottom. Shown on Agent
 * Design ("design": edits the draft) and on Evaluations ("code": changes the
 * built agent). One conversation is shared across those pages.
 */
export function AgentBuilder({
  projectId,
  mode,
  disabled = false,
  beforeSend,
  onChanged,
}: {
  projectId: string;
  mode: "design" | "code";
  /** The page is busy with something else: hold sends until it's done. */
  disabled?: boolean;
  /** Runs first (e.g. save unsaved edits so the AI sees them); false cancels the send. */
  beforeSend?: () => Promise<boolean>;
  /** The agent changed: refresh the page. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const url = `/api/projects/${projectId}/agent-builder`;

  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) === "1"); } catch {}
    // "Ask the Agent Changer" from another page: open with the problem written in, ready to send.
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (ask) {
      setText(ask);
      setOpen(true);
      try { localStorage.setItem(OPEN_KEY, "1"); } catch {}
      const u = new URL(window.location.href);
      u.searchParams.delete("ask");
      window.history.replaceState(null, "", u.toString());
    }
  }, []);
  useEffect(() => {
    fetch(url).then((r) => r.json()).then((d) => setTurns(d.chat ?? [])).catch(() => {});
  }, [url]);
  // While open on wide screens, the page makes room for the panel so nothing is hidden behind it.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("design-chat-open", open);
    html.classList.toggle("design-chat-tab", !open);
    return () => html.classList.remove("design-chat-open", "design-chat-tab");
  }, [open]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "nearest" }); }, [open, turns.length, pending]);

  const toggle = (v: boolean) => {
    setOpen(v);
    try { localStorage.setItem(OPEN_KEY, v ? "1" : "0"); } catch {}
  };

  async function send() {
    const m = text.trim();
    if (!m || pending || disabled) return;
    setError(null);
    setPending(m);
    setText("");
    if (beforeSend && !(await beforeSend())) {
      setPending(null);
      setText(m);
      return;
    }
    const d = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: m, mode }),
    }).then((r) => r.json()).catch(() => ({ error: "The AI couldn't make that change." }));
    setPending(null);
    if (d.error) {
      setError(d.error);
      setText(m);
      return;
    }
    setTurns(d.chat ?? []);
    if (d.changed) onChanged();
  }

  const shown = pending ? [...turns, { role: "user" as const, text: pending }] : turns;

  if (!open) {
    return (
      <button
        onClick={() => toggle(true)}
        className="fixed right-0 top-1/2 z-40 flex w-[5.5rem] -translate-y-1/2 flex-col items-center gap-0.5 rounded-l-xl border border-r-0 border-accent/50 bg-accent px-2 py-4 text-center text-sm font-semibold leading-tight text-white shadow-lg hover:bg-accent/90"
        aria-label="Open the Automatic Agent Changer"
      >
        {/* A tall tab, but each word reads left to right. */}
        <span className="mb-1 text-lg">✦</span>
        {["Automatic", "Agent", "Changer"].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </button>
    );
  }
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-edge bg-panel shadow-2xl sm:w-[20rem]">
      <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
        <div>
          <div className="text-base font-semibold text-fg">✦ Automatic Agent Changer</div>
          <div className="text-xs text-muted">{mode === "code" ? "Tell the AI what to change in your agent." : "Tell the AI what to change in the design."}</div>
        </div>
        <button className="rounded-md px-2 py-1 text-lg leading-none text-muted hover:bg-ink hover:text-fg" onClick={() => toggle(false)} aria-label="Collapse">
          »
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {shown.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${t.role === "user" ? "rounded-br-sm bg-accent text-white" : "rounded-bl-sm bg-ink text-fg"}`}>
              {t.text}
            </div>
          </div>
        ))}
        {pending && <div className="text-xs text-muted">{mode === "code" ? "Changing your agent…" : "Updating the design…"}</div>}
        {error && <div className="text-xs text-bad">{error}</div>}
        <div ref={end} />
      </div>
      <div className="border-t border-edge p-3">
        <div className="flex items-end gap-2 rounded-xl border border-edge bg-ink px-3 py-2 focus-within:border-accent/60">
          <textarea
            className="max-h-[50vh] min-h-[8rem] flex-1 resize-y bg-transparent text-sm leading-relaxed text-fg outline-none placeholder:text-muted"
            rows={6}
            placeholder="What should change?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-40"
            disabled={!!pending || disabled || !text.trim()}
            onClick={send}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </aside>
  );
}
