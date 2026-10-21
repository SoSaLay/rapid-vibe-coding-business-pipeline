"use client";

import { useEffect, useState } from "react";
import { DocSection } from "./doc/Doc";
import { mcpSignIn } from "./mcpSignIn";

interface KeyItem {
  env: string;
  label: string;
  tool: string;
  set: boolean;
  /** Already covered by a key connected in onboarding — nothing to do. */
  shared: boolean;
  help: string;
  /** This key's service has an official MCP server you can sign in to instead. */
  mcp?: { id: string; label: string };
  /** This row is a sign-in (not a key). */
  signin?: { id: string; label: string };
}

/**
 * The keys this specific agent needs beyond what onboarding already connected
 * (tool logins, MCP tokens, a different model provider). Hidden when there are none.
 * Values go to the server and are never shown again.
 */
export function AgentKeys({ projectId, refreshKey, onSaved }: { projectId: string; refreshKey?: string; onSaved?: () => void }) {
  const [items, setItems] = useState<KeyItem[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  /** A sign-in or switch in progress (service id), and what happened. */
  const [working, setWorking] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const url = `/api/projects/${projectId}/agent-design/credentials`;

  const reload = () => fetch(url).then((r) => r.json()).then((d) => setItems(d?.items ?? [])).catch(() => setItems([]));
  useEffect(() => { reload(); }, [url, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Use (or stop using) a service through its MCP server with a sign-in instead of a key. */
  async function useMcp(svc: { id: string; label: string }, on: boolean) {
    if (!on && !confirm(`Switch ${svc.label} back to a pasted key? The agent is rebuilt to use its own ${svc.label} tools again.`)) return;
    setWorking(svc.id);
    setNote(null);
    if (on) {
      const r = await mcpSignIn(svc.id, projectId);
      if (!r.ok) {
        setWorking(null);
        setNote({ ok: false, text: r.error || "Sign-in didn't finish." });
        return;
      }
    }
    const d = await fetch(`/api/projects/${projectId}/agent-design/use-mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: svc.id, on }),
    }).then((r) => r.json()).catch(() => ({ error: "That didn't work." }));
    setWorking(null);
    if (d.error) setNote({ ok: false, text: d.error });
    else
      setNote({
        ok: true,
        text: on
          ? `Signed in to ${svc.label}. ${d.rebuilding ? `Your agent is being rebuilt to work through ${svc.label}'s MCP server, then re-tested.` : ""}`
          : `${svc.label} is back to a key. ${d.rebuilding ? "Your agent is being rebuilt." : ""}`,
      });
    await reload();
    onSaved?.();
  }

  /** Sign in again (the sign-in expired or was revoked); nothing else changes. */
  async function resign(svc: { id: string; label: string }) {
    setWorking(svc.id);
    const r = await mcpSignIn(svc.id, projectId);
    setWorking(null);
    setNote(r.ok ? { ok: true, text: `Signed in to ${svc.label} again.` } : { ok: false, text: r.error || "Sign-in didn't finish." });
    await reload();
  }

  async function save() {
    setSaving(true);
    const d = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }).then((r) => r.json()).catch(() => null);
    setSaving(false);
    if (d) {
      setItems(d.items ?? []);
      setValues({});
      onSaved?.();
    }
  }

  const needed = (items ?? []).filter((k) => !k.shared);
  if (!needed.length) return null;

  return (
    <DocSection title="Keys this agent needs">
      <div className="mt-4 overflow-hidden rounded-xl border border-edge">
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-edge bg-panel px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid">
          <span>Key</span>
          <span>Used for</span>
          <span>How to get it</span>
          <span>Value</span>
          <span>Or sign in (MCP)</span>
        </div>
        {needed.map((k) => (
          <div
            key={k.env}
            className="grid gap-2 border-b border-edge bg-ink/40 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-4"
          >
            <div className="min-w-0">
              <div className="font-medium text-fg">
                <span className={k.set ? "text-ok" : "text-warn"}>{k.set ? "✓ " : "• "}</span>
                {k.label}
              </div>
              <code className="break-all text-xs text-muted">{k.env}</code>
            </div>
            <div className="min-w-0 break-words text-muted">
              <span className="text-xs font-semibold uppercase tracking-wider md:hidden">Used for: </span>
              {k.tool.replace(/_/g, " ")}
            </div>
            <div className="min-w-0 break-words text-muted">{k.help}</div>
            {k.signin ? (
              <div className="flex flex-col items-start gap-1.5">
                {k.set ? (
                  <span className="text-sm font-medium text-ok">✓ Signed in</span>
                ) : (
                  <button className="btn-primary text-xs" disabled={!!working} onClick={() => resign(k.signin!)}>
                    {working === k.signin.id ? "Signing in…" : `Sign in to ${k.signin.label}`}
                  </button>
                )}
                <button className="text-xs text-muted underline hover:text-fg" disabled={!!working} onClick={() => useMcp(k.signin!, false)}>
                  Use a key instead
                </button>
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-1.5">
                <input
                  type="password"
                  autoComplete="off"
                  className="input h-9 w-full min-w-0 text-xs"
                  placeholder={k.set ? "Saved — paste to replace" : "Paste key"}
                  value={values[k.env] ?? ""}
                  onChange={(e) => setValues({ ...values, [k.env]: e.target.value })}
                />
              </div>
            )}
            <div className="min-w-0 text-xs">
              <span className="font-semibold uppercase tracking-wider text-muted md:hidden">Or sign in (MCP): </span>
              {k.signin ? (
                <span className="text-ok">Using {k.signin.label}&apos;s MCP server</span>
              ) : k.mcp ? (
                <button
                  className="btn-ghost text-xs disabled:opacity-50"
                  disabled={!!working}
                  title={`Use ${k.mcp.label}'s official MCP server with your own sign-in instead of a key`}
                  onClick={() => useMcp(k.mcp!, true)}
                >
                  {working === k.mcp.id ? "Signing in…" : `Sign in with ${k.mcp.label}`}
                </button>
              ) : (
                <span className="text-muted">Not available: this service has no MCP sign-in for apps. Paste a key.</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {note && <p className={`mt-3 text-sm ${note.ok ? "text-ok" : "text-bad"}`}>{note.text}</p>}
      <button className="btn-primary mt-3 text-sm" disabled={saving || Object.values(values).every((v) => !v)} onClick={save}>
        {saving ? "Saving…" : "Save keys"}
      </button>
    </DocSection>
  );
}
