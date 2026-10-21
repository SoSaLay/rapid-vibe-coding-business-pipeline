"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Doc, DocSection, DocMuted } from "./doc/Doc";
import { StopButton, useStopper } from "./StopButton";
import { StageStart } from "./StageStart";
import { AgentKeys } from "./AgentKeys";
import { StageLoading } from "./BuildingRobot";
import { AskBuilder } from "./AgentEvals";
import type { SecurityReport } from "@/lib/phases/agent-security";

interface ExampleResult {
  index: number;
  input: string;
  expected: string;
  passed: boolean;
  reason: string;
  title?: string;
  plain?: string;
}
interface Build {
  design_version: number;
  workspace_path: string;
  files: { path: string; explains: string }[];
  install?: { ok: boolean; output: string; repaired?: boolean };
  tests?: { ok: boolean; passed: number; failed: number; output: string; examples: ExampleResult[]; skipped_examples: boolean; note?: string; summarized?: boolean | number };
}

const STEPS = [
  { id: "write", label: "Write the code", busy: "Writing your agent's code from the approved design…" },
  { id: "install", label: "Install", busy: "Installing Python and packages (first time takes a minute)…" },
  { id: "test", label: "Run example tasks", busy: "Running the example tasks (dry run — nothing real is sent or changed)…" },
  { id: "review", label: "Safety review", busy: "Reviewing your agent's safety…" },
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
  security,
  autoflow = null,
  activity = [],
  autostart = false,
  onUpdated,
}: {
  /** Long jobs running for this agent right now (any stage); Engineering shows its own. */
  activity?: { phase: string; label: string }[];
  security: SecurityReport | null;
  /** The background flow carrying a design change through (null = none). */
  autoflow?: { running: boolean; stage: string; phase: string | null; message: string; error?: string } | null;
  autostart?: boolean;
  projectId: string;
  hasDesign: boolean;
  designVersion: number;
  build: Build | null;
  manifest: Record<string, any> | null;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  /** The "you can move on, but…" warning before Evaluations, while items are still open. */
  const [warnNext, setWarnNext] = useState(false);
  /** Keys this agent still needs (labels), for that warning. */
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const checkKeys = () =>
    fetch(`/api/projects/${projectId}/agent-design/credentials`)
      .then((r) => r.json())
      .then((d) => {
        const left = (d?.items ?? []).filter((k: any) => !k.shared && !k.set).map((k: any) => k.label as string);
        setMissingKeys(left);
        return left;
      })
      .catch(() => missingKeys);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const stopper = useStopper();
  const router = useRouter();
  // The background flow (after a design change) is doing the work: the page only shows it.
  const flowBusy = !!autoflow?.running && autoflow.phase === "engineering";
  const autoRan = useRef(false);

  useEffect(() => { checkKeys(); }, [projectId, designVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Test runs from before plain summaries existed: fill the titles once, quietly.
  const summarizing = useRef(false);
  useEffect(() => {
    if (!build?.tests || build.tests.summarized === 2 || summarizing.current) return;
    summarizing.current = true;
    fetch(`/api/projects/${projectId}/agent-build/summaries`, { method: "POST" }).then((r) => r.ok && onUpdated()).catch(() => {});
  }, [build?.tests]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tests and the safety review are part of the build: whenever a finished build lacks them, run them on their own.
  const reviewFor = useRef<string | null>(null);
  useEffect(() => {
    const current = !!security && !!build && security.design_version === build.design_version;
    if (!build?.install?.ok || build.design_version !== designVersion || busy || flowBusy) return;
    // A change from the Automatic Agent Changer clears the tests: re-test, then review.
    const key = `${build.design_version}:${build.tests ? "r" : "t"}`;
    if ((build.tests && current) || reviewFor.current === key) return;
    reviewFor.current = key;
    runFrom(build.tests ? 3 : 2);
  }, [build?.design_version, build?.install?.ok, !!build?.tests, designVersion, security?.design_version, busy, flowBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  // The design changed after this build: re-sync on arrival, once per design version.
  const resyncedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!build || build.design_version === designVersion || busy || flowBusy || resyncedFor.current === designVersion) return;
    resyncedFor.current = designVersion;
    resync();
  }, [build?.design_version, designVersion, busy, flowBusy]); // eslint-disable-line react-hooks/exhaustive-deps

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
  /**
   * Bring the code back in step with the approved design: a quick update when only settings changed
   * (skills, model, limits…), a full rebuild when the tools changed; then tests and the safety review.
   */
  async function resync() {
    setError(null);
    setLog(null);
    setBusy("Updating your agent to the new design…");
    try {
      const res = await fetch(`/api/projects/${projectId}/agent-build/refresh`, { method: "POST", signal: stopper.signal() });
      if (res.status === 409) {
        // The tools themselves changed: the code has to be written again.
        setBusy(null);
        await runFrom(0);
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || "Updating the agent failed.");
      const b = res.ok ? d.build : null;
      onUpdated();
      if (b) {
        setBusy(STEPS[2].busy);
        if (await step("test")) {
          setBusy(STEPS[3].busy);
          await step("review");
        }
        onUpdated();
      }
    } catch (e: any) {
      if (!stopper.isAbort(e)) setError(e?.message || "Updating the agent failed.");
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
    else router.push(`/project/${projectId}/qa?autostart=1`);
  }

  if (!hasDesign) return <StageStart label="Start Development" locked="Approve the Agent Design first." onStart={() => {}} />;
  if (autostart && !build && !busy && !autoRan.current) {
    autoRan.current = true;
    setTimeout(() => runFrom(0), 0);
  }

  if (!build) {
    return (
      <StageStart
        label="Start Development"
        busy={busy}
        error={error}
        onStart={() => runFrom(0)}
        onStop={() => { stopper.stop(); setBusy(null); }}
      />
    );
  }

  const stale = !!build && build.design_version !== designVersion;
  const reviewed = !!security && security.design_version === build.design_version;
  const done = { write: !!build && !stale, install: !!build?.install?.ok && !stale, test: !!build?.tests && !stale, review: reviewed && !stale };
  const redSafety = reviewed
    ? security!.checks.filter((c) => c.status === "fail").length + security!.threat_model.entry_points.filter((e) => !e.mitigated).length
    : 0;
  const examples = build?.tests?.examples ?? [];
  const allPass = !!build?.tests?.ok && examples.length > 0 && examples.every((e) => e.passed);
  const failingTasks = examples.filter((e) => !e.passed).length;
  /** What's still open when moving on to Evaluations (the warning lists them). */
  const openIssues = [
    ...(!reviewed ? ["the safety review hasn't finished"] : redSafety > 0 ? [`${redSafety} safety item${redSafety === 1 ? " is" : "s are"} still open`] : []),
    ...(!allPass ? [failingTasks ? `${failingTasks} example task${failingTasks === 1 ? "" : "s"} failed` : "not every check passed"] : []),
    ...(missingKeys.length ? [`${missingKeys.length} key${missingKeys.length === 1 ? " is" : "s are"} still missing`] : []),
  ];

  return (
    <Doc>
      {flowBusy && <StageLoading text={autoflow!.message || "Building the latest changes you made in Agent Design…"} />}
      {/* Work started elsewhere (Operations' Fix it, Evaluations, the safety checklist…) still shows here. */}
      {!flowBusy && !busy && activity.some((a) => a.phase === "engineering") && (
        <StageLoading text={`${activity.find((a) => a.phase === "engineering")!.label}…`} />
      )}
      {autoflow && !autoflow.running && autoflow.stage === "failed" && autoflow.error && build.design_version !== designVersion && (
        <p className="mb-4 rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">Building your latest change failed: {autoflow.error}</p>
      )}
      {/* Build controls live in the top-right corner, out of the reading flow. */}
      {!busy && !flowBusy && (
        <div className="-mt-2 mb-4 flex flex-wrap justify-end gap-2">
          {stale && error && (
            <button className="btn-primary text-sm" onClick={resync}>
              Try again
            </button>
          )}
          {!done.install && !stale && <button className="btn-ghost text-sm" onClick={() => runFrom(1)}>Retry install</button>}
          {done.install && <button className="btn-ghost text-sm" onClick={() => runFrom(2)}>Re-run tests</button>}
        </div>
      )}
      <section className="doc-section">
        {busy && <div className="mt-5"><StageLoading text={busy} onStop={() => { stopper.stop(); setBusy(null); }} /></div>}
        {stale && !busy && !flowBusy && !error && <DocMuted className="mt-2">Your design changed: updating your agent…</DocMuted>}
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        {log && <pre className="mt-3 max-h-60 overflow-auto rounded-lg border border-edge bg-ink p-3 text-[11px] text-fg/80 whitespace-pre-wrap">{log}</pre>}
      </section>

      {!stale && <Codebase projectId={projectId} build={build} />}

      {!stale && <AgentKeys projectId={projectId} refreshKey={String(build.design_version)} />}

      {!stale && reviewed && <FixAllSafety projectId={projectId} refreshKey={`${build.design_version}-${build.tests?.passed}-${build.tests?.failed}-${security?.ran_at}`} onDone={onUpdated} />}

      {!stale && (
        <DocSection title="Safety checklist">
          <SubHead>Code (logic)</SubHead>
          {!build.tests ? (
            <p className="text-sm text-muted">Not tested yet: run the tests above.</p>
          ) : (
          <>
          {build.tests.skipped_examples && <p className="text-sm text-muted">Task checks skipped: the model key isn&apos;t set.</p>}
          {!build.tests.skipped_examples && (
            <div className="space-y-2">
              {examples.map((e) => (
                <SafetyItem key={e.index} state={e.passed ? "pass" : "fail"} title={e.title || `Task ${e.index + 1}`}>
                  <p className={e.passed ? "text-fg/90" : "text-bad"}>{e.plain || e.reason}</p>
                  <p className="text-xs text-muted"><span className="font-semibold">Task:</span> {e.input}</p>
                  <p className="text-xs text-muted"><span className="font-semibold">Should:</span> {e.expected}</p>
                </SafetyItem>
              ))}
            </div>
          )}
          </>
          )}

          <SubHead>Security</SubHead>
          {/* A review that's being redone (or failed to redo) never blanks the section: the last one stays, with a note. */}
          {!reviewed && (
            <p className={`mb-2 text-sm ${error && !busy ? "text-bad" : "text-muted"}`}>
              {error && !busy ? `Couldn't redo the safety review: ${error}` : "Reviewing your agent's safety…"}
              {security && " Showing the last review until the new one is in."}
            </p>
          )}
          {security && (
            <div className="space-y-2">
              {security!.checks.map((c) => (
                <SafetyItem
                  key={c.id}
                  state={c.status === "pass" ? "pass" : c.status === "fixed" ? "fixed" : c.status === "deferred" ? "later" : c.status === "exception" ? "accepted" : "fail"}
                  title={CHECK_TITLES[c.id] ?? c.label}
                  fix={reviewed && (c.status === "fail" || c.status === "exception") ? { projectId, target: { kind: "check", id: c.id }, accepted: c.status === "exception", onDone: onUpdated } : undefined}
                >
                  {c.status === "fixed" ? (
                    <p className="text-ok">Fixed: {c.fix_note}</p>
                  ) : c.status === "exception" ? (
                    <p className="text-warn">You accepted this risk: {c.exception_note}</p>
                  ) : (
                    <p className={c.status === "fail" ? "text-bad" : "text-fg/90"}>{c.detail}</p>
                  )}
                </SafetyItem>
              ))}
            </div>
          )}

          {security && (
            <>
              <SubHead>Threat model</SubHead>
              <div className="space-y-2">
                {security!.threat_model.entry_points.map((e, i) => (
                  <SafetyItem
                    key={`e${i}`}
                    state={e.fix_note ? "fixed" : e.mitigated ? "pass" : "fail"}
                    title={`Tricked by ${shortSource(e.source)}`}
                    fix={reviewed && !e.mitigated ? { projectId, target: { kind: "threat", index: i }, onDone: onUpdated } : undefined}
                  >
                    {e.fix_note && <p className="text-ok">Fixed: {e.fix_note}</p>}
                    <p className="text-fg/90"><span className="font-semibold">Could make it:</span> {e.injected_instruction_could}</p>
                    {!e.fix_note && <p className="text-xs text-muted"><span className="font-semibold">Stopped by:</span> {e.control}</p>}
                  </SafetyItem>
                ))}
                {byTool(security!.threat_model.tool_misuse).map(([tool, rows]) => (
                  <SafetyItem key={tool} state="info" title={`If "${tool.replace(/_/g, " ")}" is misused`}>
                    {rows.map((t, i) => (
                      <div key={i} className="space-y-1">
                        <p className="text-fg/90"><span className="font-semibold">Worst case:</span> {t.worst_misuse}</p>
                        <p className="text-xs text-muted"><span className="font-semibold">Stopped by:</span> {t.control}</p>
                      </div>
                    ))}
                  </SafetyItem>
                ))}
              </div>
            </>
          )}
        </DocSection>
      )}


      {build?.tests && !stale && !manifest && (
        <div className="mt-12 border-t border-edge pt-8">
          {/* Always open once it's built: a simple or personal agent doesn't need every item fixed. Open items get a warning first. */}
          <button
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-100 disabled:opacity-50"
            disabled={!!busy}
            onClick={async () => {
              // Keys may have been added since the page loaded: check again before deciding.
              const left = await checkKeys();
              if (openIssues.length || left.length) setWarnNext(true);
              else complete(false);
            }}
          >
            {busy === "Finishing…" ? "Finishing…" : "Start Evaluations →"}
          </button>
          {warnNext && openIssues.length > 0 && (
            <div className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
              <p className="font-semibold text-fg">You can start Evaluations now, but {openIssues.length > 1 ? `${openIssues.slice(0, -1).join(", ")} and ${openIssues[openIssues.length - 1]}` : openIssues[0]}.</p>
              <p className="mt-2 text-fg/90">
                That&apos;s fine for a simple or personal agent: something just for you, or that you&apos;re trying out.
              </p>
              {missingKeys.length > 0 && (
                <p className="mt-2 text-fg/90">
                  <span className="font-semibold">Missing keys:</span> {missingKeys.join(", ")}. The agent can&apos;t use the tools that need
                  them until they&apos;re set, so tests that use those tools will fail. Add them later under &quot;Keys this agent needs&quot; on
                  this page.
                </p>
              )}
              <p className="mt-2 text-fg/90">
                If other people will use this agent, or its work has to be accurate (it sends, buys, changes or decides things),
                fix these first. Fix all issues above takes care of most of them.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary text-sm" onClick={() => { setWarnNext(false); complete(true); }}>
                  Continue anyway
                </button>
                <button className="btn-ghost text-sm" onClick={() => setWarnNext(false)}>
                  Fix them first
                </button>
              </div>
            </div>
          )}
          {!warnNext && openIssues.length > 0 && (
            <p className="mt-2 text-center text-xs text-muted">Open: {openIssues.join(", ")}. You can still move on.</p>
          )}
        </div>
      )}
    </Doc>
  );
}

/** Plain titles for the security checks (the stored labels are the reviewer's wording). */
const CHECK_TITLES: Record<string, string> = {
  approval: "Asks you before risky actions",
  secrets: "Keys kept secret",
  "least-privilege": "Only the access it needs, with a step cap",
  injection: "Can't be tricked by text it reads",
  "user-auth": "Users must log in",
  isolation: "Each user's conversations kept separate",
  "tool-authz": "Acts only as the signed-in user",
  retention: "Personal data isn't kept forever",
};

/** "Photo page URL fetched by extract_fullres_image (requests.get …)" → "photo page URL". */
function shortSource(src: string) {
  const s = src.replace(/\s*\([^)]*\)/g, "").split(/\s+(?:via|fetched by|in|from|captured by|read by)\s+/i)[0].trim();
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function byTool<T extends { tool: string }>(rows: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r.tool, [...(m.get(r.tool) ?? []), r]);
  return Array.from(m.entries());
}

/** Big red "Fix all issues": every red security check and threat, fixed one after another. */
/**
 * Fix all issues: the AI takes on everything known to be broken — red safety items, failing example tasks
 * and the latest evaluation failures — fixing the agent, or a test that is itself wrong. Then it's re-tested.
 */
function FixAllSafety({ projectId, refreshKey, onDone }: { projectId: string; refreshKey: unknown; onDone: () => void }) {
  const [stage, setStage] = useState<"idle" | "confirm" | "fixing">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ area: string; summary: string }[]>([]);
  const [n, setN] = useState<{ total: number; safety: number; examples: number; evaluations: number } | null>(null);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/agent-build/fix-all`).then((r) => r.json()).then((d) => !d.error && setN(d)).catch(() => {});
  }, [projectId, refreshKey, stage]);
  const count = n?.total ?? 0;
  async function run() {
    setStage("fixing");
    setMsg(null);
    setFailed([]);
    const d = await fetch(`/api/projects/${projectId}/agent-build/fix-all`, { method: "POST" }).then((r) => r.json()).catch(() => ({ error: "That didn't work." }));
    setStage("idle");
    if (d.error) setMsg(d.error);
    else {
      const bad = (d.results ?? []).filter((r: any) => !r.fixed);
      const good = (d.results ?? []).length - bad.length;
      setFailed(bad);
      setMsg(`${good} fixed${bad.length ? `, ${bad.length} couldn't be fixed automatically` : ""}. ${good ? "Your agent is being re-tested now." : ""}`);
    }
    onDone();
  }
  const parts = n
    ? [
        n.safety && `${n.safety} safety item${n.safety === 1 ? "" : "s"}`,
        n.examples && `${n.examples} failing example task${n.examples === 1 ? "" : "s"}`,
        n.evaluations && `${n.evaluations} evaluation problem${n.evaluations === 1 ? "" : "s"}`,
      ].filter(Boolean)
    : [];
  return (
    <div className="mt-12 space-y-3">
      {stage === "idle" && n && count === 0 && (
        <button disabled className="w-full cursor-default whitespace-nowrap rounded-xl border border-ok/40 bg-ok/15 px-5 py-3 text-base font-semibold text-ok opacity-80 sm:w-1/4 sm:min-w-[13rem]">
            ✓ All issues fixed
          </button>
      )}
      {stage === "idle" && count > 0 && (
        <button
          className="w-full whitespace-nowrap rounded-xl bg-bad px-5 py-3 text-base font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-100 sm:w-1/4 sm:min-w-[13rem]"
          onClick={() => setStage("confirm")}
        >
          Fix all issues ({count})
        </button>
      )}
      {stage === "confirm" && (
        <div className="space-y-3 rounded-xl border border-bad/40 bg-ink/40 p-4 text-sm">
          <p className="text-fg">
            The AI will work through everything that&apos;s failing ({parts.join(", ")}), one after another. For each, it fixes your agent&apos;s
            code, or corrects a test that is itself wrong. Then your agent is re-tested.
          </p>
          <div className="flex gap-2">
            <button className="rounded-lg bg-bad px-4 py-2 text-sm font-semibold text-white hover:opacity-90" onClick={run}>Confirm, fix all</button>
            <button className="btn-ghost text-sm" onClick={() => setStage("idle")}>Cancel</button>
          </div>
        </div>
      )}
      {stage === "fixing" && <StageLoading text={`Fixing ${count} issue${count === 1 ? "" : "s"}, one after another…`} size="sm" />}
      {msg && <p className="text-sm text-warn">{msg}</p>}
      {failed.length > 0 && (
        <ul className="space-y-1 text-sm">
          {failed.map((f, i) => (
            <li key={i} className="text-fg/90">
              <span className="text-xs text-muted">{f.area}:</span> {f.summary} <AskBuilder projectId={projectId} text={f.summary} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted first:mt-0">{children}</h3>;
}

type ItemState = "pass" | "fail" | "fixed" | "later" | "accepted" | "info";
const ICON: Record<ItemState, { glyph: string; cls: string }> = {
  pass: { glyph: "✓", cls: "bg-ok text-onbright" },
  fixed: { glyph: "✓", cls: "bg-ok text-onbright" },
  fail: { glyph: "✗", cls: "bg-bad text-white" },
  later: { glyph: "…", cls: "bg-edge text-muted" },
  accepted: { glyph: "!", cls: "bg-warn text-onbright" },
  info: { glyph: "i", cls: "bg-accent/20 text-accent" },
};

type FixTarget = { kind: "check"; id: string } | { kind: "threat"; index: number };

/**
 * One checklist row: status icon + title, and — on a red row — a Fix it button right on the row.
 * Open the row for the short explanation, extra instructions for the fix, or to accept the risk.
 */
function SafetyItem({ state, title, fix, children }: {
  state: ItemState;
  title: string;
  fix?: { projectId: string; target: FixTarget; accepted?: boolean; onDone: () => void };
  children: React.ReactNode;
}) {
  const i = ICON[state];
  const [fixing, setFixing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "details" | "accept">(null);
  const [text, setText] = useState("");

  async function runFix(details = "") {
    if (!fix) return;
    setFixing(true);
    setMsg(null);
    const d = await fetch(`/api/projects/${fix.projectId}/agent-build/fix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: fix.target, details }),
    }).then((r) => r.json()).catch(() => ({ error: "The fix didn't work." }));
    setFixing(false);
    if (d.error) setMsg(d.error);
    else if (!d.fixed) setMsg(d.summary);
    else fix.onDone();
  }
  async function accept(note: string) {
    if (!fix || fix.target.kind !== "check") return;
    await fetch(`/api/projects/${fix.projectId}/security/exception`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fix.target.id, note }),
    });
    setMode(null);
    fix.onDone();
  }

  return (
    <details className="group rounded-lg border border-edge bg-ink/40">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i.cls}`}>{i.glyph}</span>
        <span className={`flex-1 font-medium ${state === "fixed" ? "text-muted line-through" : "text-fg"}`}>{title}</span>
        {state === "later" && <span className="text-[11px] text-muted">At deployment</span>}
        {fix &&
          (fixing ? (
            <span className="text-xs text-muted">Fixing…</span>
          ) : (
            <button
              className="shrink-0 rounded-lg bg-bad px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
              onClick={(e) => {
                e.preventDefault(); // don't toggle the row
                runFix();
              }}
            >
              Fix it
            </button>
          ))}
        <span className="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-2 border-t border-edge px-4 py-3 text-sm">
        {children}
        {fixing && <StageLoading text="Fixing it in your agent's code…" size="sm" />}
        {fix && !fixing && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <button className="text-xs text-accent underline" onClick={() => setMode(mode === "details" ? null : "details")}>
                Fix it my way
              </button>
              {fix.target.kind === "check" &&
                (fix.accepted ? (
                  <button className="text-xs text-accent underline" onClick={() => accept("")}>Withdraw acceptance</button>
                ) : (
                  <button className="text-xs text-muted underline" onClick={() => setMode(mode === "accept" ? null : "accept")}>Accept the risk</button>
                ))}
            </div>
            {mode && (
              <div className="flex flex-wrap gap-2">
                <input
                  className="input h-9 min-w-0 flex-1 text-sm"
                  placeholder={mode === "details" ? "Tell the AI how you'd like it fixed" : "Why is this OK? (e.g. I watch every run)"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button className="btn-ghost text-sm" disabled={!text.trim()} onClick={() => (mode === "details" ? runFix(text) : accept(text))}>
                  {mode === "details" ? "Fix with this" : "Accept"}
                </button>
              </div>
            )}
          </div>
        )}
        {msg && <p className="text-xs text-warn">{msg}</p>}
      </div>
    </details>
  );
}

const EDITORS = [
  { id: "vscode", label: "VS Code", download: "https://code.visualstudio.com/download" },
  { id: "cursor", label: "Cursor", download: "https://cursor.com/download" },
] as const;

/** "Your codebase": where it lives, and one click to open it in an editor (or get the editor if it's missing). */
function Codebase({ projectId, build }: { projectId: string; build: Build }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [have, setHave] = useState<Record<string, boolean> | null>(null);
  const url = `/api/projects/${projectId}/agent-build/open`;
  useEffect(() => {
    fetch(url).then((r) => r.json()).then(setHave).catch(() => setHave({}));
  }, [url]);
  async function open(app: string) {
    setMsg(null);
    const d = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app }),
    }).then((r) => r.json()).catch(() => ({ error: "Couldn't open it." }));
    if (d.error) {
      setMsg(d.error);
      if (d.missing) setHave((h) => ({ ...(h ?? {}), [app]: false }));
    }
  }
  return (
    <DocSection title="Your codebase">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="font-medium text-fg">Lives in</span>
        <code className="break-all text-xs text-muted">{build.workspace_path}</code>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {EDITORS.map((e) =>
          have && have[e.id] === false ? (
            <a key={e.id} href={e.download} target="_blank" rel="noreferrer" className="btn-ghost text-sm">
              Download {e.label} ↗
            </a>
          ) : (
            <button key={e.id} className="btn-ghost text-sm" disabled={!have} onClick={() => open(e.id)}>
              Open in {e.label}
            </button>
          ),
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-bad">{msg}</p>}
    </DocSection>
  );
}
