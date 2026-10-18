"use client";

import { useRef, useState } from "react";
import { Doc, DocSection, DocP, DocMuted, DocFacts } from "./doc/Doc";
import { StopButton, useStopper } from "./StopButton";
import { StageStart } from "./StageStart";

interface ExampleResult {
  index: number;
  input: string;
  expected: string;
  passed: boolean;
  reason: string;
}
interface Build {
  design_version: number;
  workspace_path: string;
  files: { path: string; explains: string }[];
  install?: { ok: boolean; output: string; repaired?: boolean };
  tests?: { ok: boolean; passed: number; failed: number; output: string; examples: ExampleResult[]; skipped_examples: boolean };
}

const STEPS = [
  { id: "write", label: "Write the code", busy: "Writing your agent's code from the approved design…" },
  { id: "install", label: "Install", busy: "Installing Python and packages (first time takes a minute)…" },
  { id: "test", label: "Run example tasks", busy: "Running the example tasks (dry run — nothing real is sent or changed)…" },
] as const;

/**
 * Agent pipeline — stage 3. Builds exactly the approved design, automatically,
 * and walks the user through it. Ends on "Your codebase".
 */
export function AgentEngineering({
  projectId,
  hasDesign,
  designVersion,
  build,
  manifest,
  autostart = false,
  onUpdated,
}: {
  autostart?: boolean;
  projectId: string;
  hasDesign: boolean;
  designVersion: number;
  build: Build | null;
  manifest: Record<string, any> | null;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const stopper = useStopper();
  const autoRan = useRef(false);

  async function step(id: string, body?: any): Promise<Build | null> {
    const res = await fetch(`/api/projects/${projectId}/agent-build/${id}`, {
      method: "POST",
      signal: stopper.signal(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error || `${id} failed.`);
      if (d.build?.install?.output) setLog(d.build.install.output);
      return null;
    }
    return d.build ?? null;
  }

  /** Run from `from` to the end, stopping at the first failure. */
  async function runFrom(from: number) {
    setError(null);
    setLog(null);
    try {
      for (const s of STEPS.slice(from)) {
        setBusy(s.busy);
        const b = await step(s.id);
        onUpdated();
        if (!b) break;
      }
    } catch (e: any) {
      if (!stopper.isAbort(e)) setError(e?.message || "Build failed.");
    }
    setBusy(null);
  }

  /** Light update: re-render without rewriting code (skills, knowledge, model, limits), then re-run the tests. */
  async function light() {
    setError(null);
    setLog(null);
    setBusy("Applying the design changes (no code rewrite)…");
    try {
      const b = await step("refresh");
      onUpdated();
      if (b) {
        setBusy(STEPS[2].busy);
        await step("test");
        onUpdated();
      }
    } catch (e: any) {
      if (!stopper.isAbort(e)) setError(e?.message || "Light update failed.");
    }
    setBusy(null);
  }

  async function complete(force: boolean) {
    setBusy("Finishing…");
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/agent-build/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(d.error || "Failed.");
    else onUpdated();
  }

  if (!hasDesign) return <StageStart label="Start Engineering & Development" locked="Approve the Agent Design first." onStart={() => {}} />;
  if (autostart && !build && !busy && !autoRan.current) {
    autoRan.current = true;
    setTimeout(() => runFrom(0), 0);
  }

  if (!build) {
    return <StageStart label="Start Engineering & Development" busy={busy} error={error} onStart={() => runFrom(0)} onStop={() => { stopper.stop(); setBusy(null); }} />;
  }

  const stale = !!build && build.design_version !== designVersion;
  const done = { write: !!build && !stale, install: !!build?.install?.ok && !stale, test: !!build?.tests && !stale };
  const examples = build?.tests?.examples ?? [];
  const allPass = !!build?.tests?.ok && examples.length > 0 && examples.every((e) => e.passed);

  return (
    <Doc>
      <DocSection title="The build">
        <DocP>
          This builds exactly the design you approved. Nothing new is decided here. It writes the code, installs it, and tries it on your
          example tasks. Write actions run in dry run, so nothing real is sent or changed.
        </DocP>
        <ol className="mt-4 space-y-2">
          {STEPS.map((s, i) => {
            const ok = done[s.id];
            const failed = s.id === "install" ? build?.install && !build.install.ok : s.id === "test" ? build?.tests && !allPass : false;
            return (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    ok && !failed ? "bg-ok text-onbright" : failed && !stale ? "bg-warn text-onbright" : "bg-edge text-muted"
                  }`}
                >
                  {ok && !failed ? "✓" : i + 1}
                </span>
                <span className="text-fg">{s.label}</span>
                {s.id === "install" && build?.install?.repaired && !stale && <span className="text-xs text-muted">(fixed a problem automatically)</span>}
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {busy ? (
            <>
              <span className="text-sm text-muted">{busy}</span>
              <StopButton onStop={() => { stopper.stop(); setBusy(null); }} />
            </>
          ) : (
            <>
              {stale && (
                <button className="btn-primary" onClick={light}>
                  Apply design changes →
                </button>
              )}
              <button className={stale ? "btn-ghost" : "btn-primary"} onClick={() => runFrom(0)}>
                {!build ? "Build my agent →" : stale ? "Rebuild everything" : "Rebuild from scratch"}
              </button>
              {build && !stale && !done.install && <button className="btn-ghost" onClick={() => runFrom(1)}>Retry install</button>}
              {done.install && <button className="btn-ghost" onClick={() => runFrom(2)}>Re-run tests</button>}
            </>
          )}
        </div>
        {stale && (
          <DocMuted className="mt-2">
            The design changed after this build. If you only changed skills, knowledge, the model, memory, approvals or limits, apply the
            changes. Nothing is rewritten. New or changed tools need Rebuild everything.
          </DocMuted>
        )}
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        {log && <pre className="mt-3 max-h-60 overflow-auto rounded-lg border border-edge bg-ink p-3 text-[11px] text-fg/80 whitespace-pre-wrap">{log}</pre>}
      </DocSection>

      {build?.tests && !stale && (
        <DocSection title="Example tasks">
          {build.tests.skipped_examples ? (
            <DocMuted>Skipped: the model key isn't set. Add it under Agent Design → Credentials, then re-run the tests.</DocMuted>
          ) : (
            <ul className="space-y-3">
              {examples.map((e) => (
                <li key={e.index} className="text-sm">
                  <span className={e.passed ? "text-ok" : "text-bad"}>{e.passed ? "✓ Pass" : "✗ Fail"}</span>{" "}
                  <span className="text-fg">{e.input}</span>
                  <DocMuted>{e.reason}</DocMuted>
                </li>
              ))}
            </ul>
          )}
          <DocFacts items={[{ label: "Code checks", value: `${build.tests.passed} passed · ${build.tests.failed} failed` }]} />
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted">Test output</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-edge bg-ink p-3 text-[11px] text-fg/80 whitespace-pre-wrap">{build.tests.output}</pre>
          </details>
          {!manifest && (
            <div className="mt-4 flex flex-wrap gap-2">
              {allPass ? (
                <button className="btn-primary" disabled={!!busy} onClick={() => complete(false)}>Finish → Security</button>
              ) : (
                <button className="btn-ghost" disabled={!!busy} onClick={() => complete(true)}>Continue anyway → Security</button>
              )}
            </div>
          )}
          {manifest && <p className="mt-4 text-sm text-ok">Build recorded. Security is unlocked.</p>}
        </DocSection>
      )}

      {build && !stale && <Codebase projectId={projectId} build={build} />}
    </Doc>
  );
}

/** "Your codebase": what each part does in plain language; the code is one click away. */
function Codebase({ projectId, build }: { projectId: string; build: Build }) {
  const [open, setOpen] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");

  async function view(p: string) {
    if (open === p) return setOpen(null);
    setOpen(p);
    setContent("Loading…");
    const d = await fetch(`/api/projects/${projectId}/agent-build/file?path=${encodeURIComponent(p)}`).then((r) => r.json()).catch(() => null);
    setContent(d?.content ?? "Couldn't load this file.");
  }

  const main = build.files.filter((f) => !f.path.endsWith("__init__.py"));
  return (
    <DocSection title="Your codebase">
      <DocP>
        This is your agent. These files hold all the logic and settings that do the work. You don't need to open them, but they're here
        if you want to look.
      </DocP>
      <DocFacts items={[{ label: "Lives in", value: <code className="break-all text-xs">{build.workspace_path}</code> }]} />
      <ul className="mt-4 divide-y divide-edge rounded-lg border border-edge">
        {main.map((f) => (
          <li key={f.path} className="p-3">
            <button className="flex w-full items-start gap-3 text-left" onClick={() => view(f.path)}>
              <code className="shrink-0 text-xs text-accent">{f.path}</code>
              <span className="text-sm text-fg/90">{f.explains}</span>
            </button>
            {open === f.path && (
              <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-ink p-3 text-[11px] leading-relaxed text-fg/80">{content}</pre>
            )}
          </li>
        ))}
      </ul>
    </DocSection>
  );
}
