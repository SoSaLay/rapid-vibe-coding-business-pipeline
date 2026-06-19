"use client";

import { useMemo, useState } from "react";

interface Channel {
  name: string;
  why_this_channel: string;
  audience_mindset: string;
  content_types: string[];
  cadence: string;
}
interface Pillar {
  name: string;
  description: string;
  example_angles: string[];
}
interface RhythmSlot {
  day: string;
  channel: string;
  format: string;
}
interface ChecklistItem {
  id: string;
  stage: "prep" | "launch_week" | "momentum";
  title: string;
  why: string;
  how: string;
}
interface WaitlistEmail {
  subject: string;
  preview_text: string;
  body_markdown: string;
}
interface Plan {
  strategy_summary: string;
  channels: Channel[];
  content_pillars: Pillar[];
  weekly_rhythm: RhythmSlot[];
  launch_checklist: ChecklistItem[];
  waitlist_email: WaitlistEmail | null;
  metrics_to_watch: string[];
}
interface Post {
  id: string;
  date: string;
  channel: string;
  pillar: string;
  format: string;
  hook: string;
  body: string;
  cta: string;
}
interface Report {
  strategy_summary: string;
  forced: boolean;
  blockers_at_signoff: string[];
  posting_stats_at_signoff: { posted: number; due_to_date: number; streak_days: number };
}

const STAGE_LABELS: Record<string, string> = {
  prep: "Before launch — get the house in order",
  launch_week: "Launch week — make noise everywhere at once",
  momentum: "After launch — convert, sell, compound",
};

export function Marketing({
  projectId,
  hasDeploy,
  state,
  report,
  onUpdated,
}: {
  projectId: string;
  hasDeploy: boolean;
  state: { plan?: Plan | null; posts?: Post[]; postedIds?: string[]; checklistDone?: string[] } | null;
  report: Report | null;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body?: any): Promise<any | null> {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/marketing/${path}`, {
      method: "POST",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(d.error || "Request failed.");
      return null;
    }
    onUpdated();
    return d;
  }

  async function skip() {
    setBusy(true);
    await fetch(`/api/projects/${projectId}/skip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: "marketing-sales" }),
    });
    setBusy(false);
    onUpdated();
  }

  if (!hasDeploy) return <div className="card p-6 text-sm text-muted">Locked until Deployment signs off.</div>;

  const plan = state?.plan ?? null;

  if (!plan) {
    return (
      <div className="card p-6 space-y-4">
        <p className="text-sm text-muted text-center">
          The marketing director reads everything the pipeline knows — your product, audience research, positioning,
          waitlist, live URL — and builds a lean go-to-market: 2–3 channels, a weekly rhythm, two weeks of
          ready-to-post content, and an in-depth launch checklist that takes you from "nobody knows this exists" to
          first sales. You post for ~10 minutes a day; it does the rest.
        </p>
        <div className="flex justify-center gap-3">
          <button className="btn-primary" disabled={busy} onClick={() => post("plan")}>
            {busy ? "Building the campaign…" : "Generate campaign plan"}
          </button>
          <button className="btn-ghost" disabled={busy} onClick={skip}>
            Skip this phase
          </button>
        </div>
        <p className="text-[11px] text-muted text-center">
          Skippable — but if this product should make money, this phase is how people find it.
        </p>
        {error && <p className="text-sm text-bad text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {report && (
        <div className={`card p-4 border ${report.forced ? "border-warn/30" : "border-ok/30"}`}>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${report.forced ? "bg-warn" : "bg-ok"} text-onbright`}>
            {report.forced ? "launched with open items" : "launched"}
          </span>
          <span className="ml-3 text-xs text-muted">The posting loop below stays live — consistency is the strategy.</span>
        </div>
      )}

      <PostingLoop
        plan={plan}
        posts={state?.posts ?? []}
        postedIds={state?.postedIds ?? []}
        busy={busy}
        post={post}
      />

      <LaunchChecklist
        items={plan.launch_checklist}
        done={state?.checklistDone ?? []}
        busy={busy}
        onToggle={(id, done) => post("track", { checklistId: id, done })}
      />

      {plan.waitlist_email && <WaitlistEmailView email={plan.waitlist_email} />}

      <StrategyView plan={plan} />

      {!report && (
        <SignOff
          plan={plan}
          posts={state?.posts ?? []}
          checklistDone={state?.checklistDone ?? []}
          busy={busy}
          post={post}
        />
      )}

      {error && <p className="text-sm text-bad text-center">{error}</p>}
    </div>
  );
}

/* ---------------- Shared ---------------- */

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-muted">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Copyable({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-[11px] text-accent2 hover:text-fg"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "copied ✓" : label || "copy"}
    </button>
  );
}

/* ---------------- The posting loop (Today + upcoming + streak) ---------------- */

function PostingLoop({
  plan,
  posts,
  postedIds,
  busy,
  post,
}: {
  plan: Plan;
  posts: Post[];
  postedIds: string[];
  busy: boolean;
  post: (path: string, body?: any) => Promise<any | null>;
}) {
  const posted = useMemo(() => new Set(postedIds), [postedIds]);
  const today = new Date().toISOString().slice(0, 10);
  const due = posts.filter((p) => p.date <= today && !posted.has(p.id));
  const upcoming = posts.filter((p) => p.date > today).slice(0, 6);
  const doneToDate = posts.filter((p) => p.date <= today && posted.has(p.id)).length;
  const dueToDate = posts.filter((p) => p.date <= today).length;
  const lastDate = posts.length ? posts.map((p) => p.date).sort().slice(-1)[0] : null;
  const runningLow = !lastDate || lastDate <= today;

  // streak: consecutive past days fully posted (display version of lib computePostingStats)
  const streak = useMemo(() => {
    const byDate = new Map<string, Post[]>();
    for (const p of posts) {
      if (!byDate.has(p.date)) byDate.set(p.date, []);
      byDate.get(p.date)!.push(p);
    }
    let s = 0;
    const d = new Date(today + "T00:00:00Z");
    for (let i = 0; i < 365; i++) {
      const iso = d.toISOString().slice(0, 10);
      const dd = byDate.get(iso) || [];
      if (dd.length > 0) {
        if (dd.every((p) => posted.has(p.id))) s++;
        else if (iso !== today) break;
      }
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return s;
  }, [posts, posted, today]);

  if (posts.length === 0) {
    return (
      <Section title="Content">
        <p className="text-xs text-muted mb-3">
          The plan is ready — now generate your first two weeks of posts, written in your brand voice and scheduled to
          the weekly rhythm.
        </p>
        <button className="btn-primary" disabled={busy} onClick={() => post("batch")}>
          {busy ? "Writing two weeks of content…" : "Generate 2 weeks of content"}
        </button>
      </Section>
    );
  }

  return (
    <Section
      title={`Today — your 10 minutes`}
      action={
        <span className="text-[11px] text-muted">
          {streak > 0 && <span className="text-ok">🔥 {streak}-day streak · </span>}
          {doneToDate}/{dueToDate} posted
        </span>
      }
    >
      {due.length === 0 ? (
        <p className="text-xs text-ok">Nothing due — you're all caught up. 🎉</p>
      ) : (
        <div className="space-y-3">
          {due.map((p) => (
            <PostCard key={p.id} p={p} overdue={p.date < today} busy={busy} onPosted={() => post("track", { postId: p.id })} />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Coming up</div>
          {upcoming.map((p) => (
            <p key={p.id} className="text-[11px] text-muted truncate">
              {p.date.slice(5)} · {p.channel} — {p.hook}
            </p>
          ))}
        </div>
      )}

      {runningLow && (
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-ghost" disabled={busy} onClick={() => post("batch")}>
            {busy ? "Writing…" : "Generate next 2 weeks →"}
          </button>
          <span className="text-[11px] text-warn">Schedule is running out.</span>
        </div>
      )}
    </Section>
  );
}

function PostCard({ p, overdue, busy, onPosted }: { p: Post; overdue: boolean; busy: boolean; onPosted: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border p-3 ${overdue ? "border-warn/40" : "border-edge"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted">
          {overdue ? `${p.date.slice(5)} (overdue) · ` : ""}
          {p.channel} · {p.format} · {p.pillar}
        </span>
        <Copyable text={p.body} label="copy post" />
      </div>
      <p className="mt-1 text-xs font-medium text-fg">{p.hook}</p>
      <button className="mt-1 text-[11px] text-accent2 hover:text-fg" onClick={() => setOpen((o) => !o)}>
        {open ? "hide" : "show full post"}
      </button>
      {open && <pre className="mt-2 whitespace-pre-wrap rounded bg-ink p-2.5 text-[11px] text-fg/85">{p.body}</pre>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted truncate">CTA: {p.cta}</span>
        <button className="rounded-full bg-ok px-3 py-1 text-[11px] font-semibold text-onbright" disabled={busy} onClick={onPosted}>
          posted ✓
        </button>
      </div>
    </div>
  );
}

/* ---------------- Launch checklist ---------------- */

function LaunchChecklist({
  items,
  done,
  busy,
  onToggle,
}: {
  items: ChecklistItem[];
  done: string[];
  busy: boolean;
  onToggle: (id: string, done: boolean) => void;
}) {
  const doneSet = new Set(done);
  const stages: ChecklistItem["stage"][] = ["prep", "launch_week", "momentum"];
  return (
    <Section title={`Launch checklist (${done.length}/${items.length})`}>
      <div className="space-y-4">
        {stages.map((stage) => {
          const group = items.filter((i) => i.stage === stage);
          if (!group.length) return null;
          return (
            <div key={stage}>
              <div className="text-[10px] uppercase tracking-wider text-accent2 mb-1.5">{STAGE_LABELS[stage]}</div>
              <div className="space-y-2">
                {group.map((item) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    checked={doneSet.has(item.id)}
                    busy={busy}
                    onToggle={(v) => onToggle(item.id, v)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function ChecklistRow({
  item,
  checked,
  busy,
  onToggle,
}: {
  item: ChecklistItem;
  checked: boolean;
  busy: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-edge p-2.5">
      <div className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5" checked={checked} disabled={busy} onChange={(e) => onToggle(e.target.checked)} />
        <div className="min-w-0 flex-1">
          <button
            className={`text-left text-xs ${checked ? "text-muted line-through" : "text-fg"}`}
            onClick={() => setOpen((o) => !o)}
          >
            {item.title}
          </button>
          {open && (
            <div className="mt-1 space-y-1">
              <p className="text-[11px] text-muted">
                <span className="text-accent2">Why:</span> {item.why}
              </p>
              <p className="text-[11px] text-fg/80">
                <span className="text-accent2">How:</span> {item.how}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Waitlist email + strategy + sign-off ---------------- */

function WaitlistEmailView({ email }: { email: WaitlistEmail }) {
  const full = `Subject: ${email.subject}\nPreview: ${email.preview_text}\n\n${email.body_markdown}`;
  return (
    <Section title="Launch email — your waitlist" action={<Copyable text={full} label="copy email" />}>
      <p className="text-xs text-fg font-medium">{email.subject}</p>
      <p className="text-[11px] text-muted mb-2">{email.preview_text}</p>
      <pre className="whitespace-pre-wrap rounded bg-ink p-2.5 text-[11px] text-fg/85 max-h-64 overflow-y-auto">{email.body_markdown}</pre>
      <p className="mt-2 text-[10px] text-muted">
        These are the warmest leads you'll ever have — send this on launch day (your email tool, or a Resend connector
        later).
      </p>
    </Section>
  );
}

function StrategyView({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false);
  return (
    <Section
      title="Strategy"
      action={
        <button className="text-[11px] text-accent2 hover:text-fg" onClick={() => setOpen((o) => !o)}>
          {open ? "collapse" : "expand"}
        </button>
      }
    >
      <p className="text-sm text-fg/90">{plan.strategy_summary}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {plan.channels.map((c) => (
          <span key={c.name} className="rounded-full bg-edge/60 px-2.5 py-0.5 text-[11px] text-fg">
            {c.name} · {c.cadence}
          </span>
        ))}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          {plan.channels.map((c) => (
            <div key={c.name} className="rounded-lg border border-edge p-3">
              <div className="text-xs font-medium text-fg">{c.name}</div>
              <p className="text-[11px] text-muted mt-0.5">{c.why_this_channel}</p>
              <p className="text-[11px] text-muted">Mindset: {c.audience_mindset}</p>
              <p className="text-[11px] text-muted">Formats: {c.content_types.join(", ")}</p>
            </div>
          ))}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Content pillars</div>
            {plan.content_pillars.map((p) => (
              <div key={p.name} className="mb-2">
                <p className="text-xs text-fg">{p.name}</p>
                <p className="text-[11px] text-muted">{p.description}</p>
                <p className="text-[11px] text-muted/80">Angles: {p.example_angles.join(" · ")}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Weekly rhythm</div>
            {plan.weekly_rhythm.map((r, i) => (
              <p key={i} className="text-[11px] text-fg/85">
                {r.day} — {r.channel} ({r.format})
              </p>
            ))}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Metrics worth watching</div>
            {plan.metrics_to_watch.map((m, i) => (
              <p key={i} className="text-[11px] text-fg/85">
                · {m}
              </p>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function SignOff({
  plan,
  posts,
  checklistDone,
  busy,
  post,
}: {
  plan: Plan;
  posts: Post[];
  checklistDone: string[];
  busy: boolean;
  post: (path: string, body?: any) => Promise<any | null>;
}) {
  const open = plan.launch_checklist.length - checklistDone.length;
  const ready = posts.length > 0 && open === 0;
  return (
    <Section title="Sign-off">
      {ready ? (
        <p className="text-xs text-ok mb-2">Launched and running. Sign off to unlock Operations — the loop stays live.</p>
      ) : (
        <p className="text-xs text-warn mb-2">
          {posts.length === 0 ? "Generate the first content batch. " : ""}
          {open > 0 ? `${open} launch checklist item(s) still open.` : ""}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !ready} onClick={() => post("complete")}>
          {busy ? "Signing off…" : "Sign off → unlock Operations"}
        </button>
        {!ready && (
          <button className="btn-ghost" disabled={busy} onClick={() => post("complete", { force: true })}>
            Sign off anyway
          </button>
        )}
      </div>
    </Section>
  );
}
