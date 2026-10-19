"use client";

import { useEffect, useState } from "react";
import { DocSection, DocMuted } from "./doc/Doc";

interface KeyItem {
  env: string;
  label: string;
  tool: string;
  set: boolean;
  /** Already covered by a key connected in onboarding — nothing to do. */
  shared: boolean;
  help: string;
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
  const url = `/api/projects/${projectId}/agent-design/credentials`;

  useEffect(() => {
    fetch(url).then((r) => r.json()).then((d) => setItems(d?.items ?? [])).catch(() => setItems([]));
  }, [url, refreshKey]);

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
  const missing = needed.filter((k) => !k.set).length;

  return (
    <DocSection title="Keys this agent needs">
      <DocMuted>
        Logins for the services this agent works with. Your onboarding keys already cover the rest.{" "}
        {missing ? `${missing} still to add.` : "All set."} Stored only on this machine.
      </DocMuted>
      <div className="mt-4 overflow-hidden rounded-xl border border-edge">
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-edge bg-panel px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid">
          <span>Key</span>
          <span>Used for</span>
          <span>How to get it</span>
          <span>Value</span>
        </div>
        {needed.map((k) => (
          <div
            key={k.env}
            className="grid gap-2 border-b border-edge bg-ink/40 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] md:gap-4"
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
            <input
              type="password"
              autoComplete="off"
              className="input h-9 w-full min-w-0 text-xs"
              placeholder={k.set ? "Saved — paste to replace" : "Paste key"}
              value={values[k.env] ?? ""}
              onChange={(e) => setValues({ ...values, [k.env]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <button className="btn-primary mt-3 text-sm" disabled={saving || Object.values(values).every((v) => !v)} onClick={save}>
        {saving ? "Saving…" : "Save keys"}
      </button>
    </DocSection>
  );
}
