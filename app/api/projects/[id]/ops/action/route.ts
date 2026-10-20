import { NextRequest, NextResponse } from "next/server";
import { attributed } from "@/lib/agent/activity";
import crypto from "crypto";
import { loadBuild } from "@/lib/agent/build-context";
import { addProductionCase, getOps, opsEnv, runOps, saveOps, type Incident } from "@/lib/agent/ops";
import { getEvals, saveEvals } from "@/lib/agent/evals-state";
import { completePhase, getProject, saveArtifact } from "@/lib/store";
import { changeAgent } from "@/lib/agent/fix";
import { startAutoflow } from "@/lib/agent/autoflow";
import { beginActivity } from "@/lib/agent/activity";

/**
 * One endpoint for the Operations page's actions. Body: { action, ... }
 *   kill { disabled }              · tool { name, on }          · online-eval { sample }      · alert
 *   settings { owner, oncall, thresholds }         · add-case { runId, expected }
 *   incident { title, severity, whatHappened, approvals, correctiveAction, runIds } · resolve { id }
 *   snapshot { days }               — records the ops-report for that period (review = 7 days) and completes the stage
 *   fix-incident { id }             — AI changes the agent to fix what the incident describes, then re-tests and redeploys
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const ctx = await loadBuild(params.id);
  if (!ctx.design) return NextResponse.json({ error: "No agent design." }, { status: 400 });
  const ops = await getOps(params.id);

  if (b.action === "settings") {
    const num = (v: unknown) => (v === "" || v === undefined || v === null || !Number.isFinite(Number(v)) ? undefined : Number(v));
    const next = {
      ...ops,
      owner: typeof b.owner === "string" ? b.owner.trim().slice(0, 120) : ops.owner,
      oncall: typeof b.oncall === "string" ? b.oncall.trim().slice(0, 200) : ops.oncall,
      thresholds: b.thresholds
        ? {
            min_success: num(b.thresholds.min_success),
            max_p95_s: num(b.thresholds.max_p95_s),
            max_cost_per_run: num(b.thresholds.max_cost_per_run),
            max_thumbs_down: num(b.thresholds.max_thumbs_down),
          }
        : ops.thresholds,
    };
    await saveOps(params.id, next);
    return NextResponse.json({ ops: next });
  }

  if (b.action === "incident") {
    const inc: Incident = {
      id: crypto.randomUUID().slice(0, 8),
      opened_at: new Date().toISOString(),
      title: String(b.title ?? "").slice(0, 200) || "Untitled incident",
      severity: ["low", "medium", "high"].includes(b.severity) ? b.severity : "medium",
      what_happened: String(b.whatHappened ?? "").slice(0, 4000),
      approvals: String(b.approvals ?? "").slice(0, 2000),
      corrective_action: String(b.correctiveAction ?? "").slice(0, 4000),
      status: "open",
      run_ids: Array.isArray(b.runIds) ? b.runIds.map(Number).filter(Number.isFinite) : [],
    };
    const next = { ...ops, incidents: [inc, ...ops.incidents] };
    await saveOps(params.id, next);
    return NextResponse.json({ ops: next });
  }

  if (b.action === "fix-incident") {
    const inc = ops.incidents.find((i) => i.id === b.id);
    if (!inc) return NextResponse.json({ error: "Incident not found." }, { status: 404 });
    const issue =
      `PRODUCTION INCIDENT (${inc.severity}): ${inc.title}\nWhat happened: ${inc.what_happened || "(not described)"}` +
      (inc.corrective_action ? `\nThe owner's idea for a fix: ${inc.corrective_action}` : "");
    const end = beginActivity(params.id, "engineering", "Fixing your agent for an incident");
    try {
      const r = await changeAgent({ projectId: params.id, issue, details: inc.corrective_action, kind: "quality", keepTests: false });
      const next = { ...ops, incidents: ops.incidents.map((i) => (i.id === inc.id ? { ...i, ai_fix: { summary: r.summary, at: new Date().toISOString(), fixed: r.fixed } } : i)) };
      await saveOps(params.id, next);
      // The code changed: Engineering re-tests and re-reviews it, then Deployment (as with Evaluations' Fix it).
      if (r.fixed) startAutoflow(params.id, req.nextUrl.origin, r.version ?? undefined, { codeReady: true });
      return NextResponse.json({ ops: next, ...r });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "The AI couldn't fix this one." }, { status: 400 });
    } finally {
      end();
    }
  }
  if (b.action === "resolve") {
    const next = {
      ...ops,
      incidents: ops.incidents.map((i) =>
        i.id === b.id ? { ...i, status: "resolved" as const, resolved_at: new Date().toISOString(), corrective_action: b.correctiveAction ? String(b.correctiveAction).slice(0, 4000) : i.corrective_action } : i
      ),
    };
    await saveOps(params.id, next);
    return NextResponse.json({ ops: next });
  }

  const env = await opsEnv(params.id, ctx.design, ctx.slug);
  if (!env) return NextResponse.json({ error: "Set up the state database in Deployment first." }, { status: 400 });

  if (b.action === "kill") {
    const r = await runOps(ctx.dir, env, ["deploy.state", b.disabled ? "disable" : "enable"]);
    return NextResponse.json({ controls: r.json }, { status: r.ok ? 200 : 500 });
  }
  if (b.action === "tool") {
    if (!ctx.design.tools.some((t) => t.name === b.name)) return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
    const r = await runOps(ctx.dir, env, ["deploy.state", b.on ? "enable-tool" : "disable-tool", b.name]);
    return NextResponse.json({ controls: r.json }, { status: r.ok ? 200 : 500 });
  }
  if (b.action === "online-eval") {
    const n = Math.min(100, Math.max(1, Number(b.sample) || 20));
    const r = await runOps(ctx.dir, env, ["deploy.ops", "online-eval", "--sample", String(n)], 15 * 60_000);
    return NextResponse.json(r.json ?? { error: r.out.slice(-1500) }, { status: r.ok ? 200 : 500 });
  }
  if (b.action === "alert") {
    const r = await runOps(ctx.dir, env, ["deploy.ops", "alert"]);
    if (!r.ok) return NextResponse.json({ error: r.out.slice(-1500) }, { status: 500 });
    const next = { ...ops, last_alert: { at: new Date().toISOString(), alerts: r.json?.alerts ?? [] } };
    await saveOps(params.id, next);
    return NextResponse.json({ ops: next, result: r.json });
  }
  if (b.action === "memory-users") {
    const r = await runOps(ctx.dir, env, ["deploy.state", "memory-users", String(b.search ?? "")]);
    return NextResponse.json({ users: r.json ?? [], forgotten: ops.forgotten ?? [] }, { status: r.ok ? 200 : 500 });
  }
  if (b.action === "memory-show") {
    if (!b.user) return NextResponse.json({ error: "Which user?" }, { status: 400 });
    const r = await runOps(ctx.dir, env, ["deploy.state", "memory-show", String(b.user)]);
    return NextResponse.json({ items: r.json ?? [] }, { status: r.ok ? 200 : 500 });
  }
  if (b.action === "memory-forget") {
    const user = String(b.user ?? "").trim();
    if (!user || b.confirm !== user) return NextResponse.json({ error: "Type the user id exactly to confirm." }, { status: 400 });
    const r = await runOps(ctx.dir, env, ["deploy.state", "memory-forget", user]);
    if (!r.ok) return NextResponse.json({ error: r.out.slice(-1000) }, { status: 500 });
    const next = { ...ops, forgotten: [{ user, at: new Date().toISOString(), removed: r.json ?? {} }, ...(ops.forgotten ?? [])].slice(0, 200) };
    await saveOps(params.id, next);
    return NextResponse.json({ removed: r.json, ops: next });
  }
  if (b.action === "add-case") {
    const expected = String(b.expected ?? "").trim();
    if (!expected) return NextResponse.json({ error: "Write what the agent should have done." }, { status: 400 });
    const failures = await runOps(ctx.dir, env, ["deploy.ops", "failures", "--limit", "200"]);
    const run = (failures.json ?? []).find((f: any) => Number(f.id) === Number(b.runId));
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    const { dataset, caseId } = await addProductionCase({ dir: ctx.dir, run, expected });
    const ev = await getEvals(params.id);
    const counts: Record<string, number> = {};
    for (const c of dataset.cases) counts[c.category] = (counts[c.category] ?? 0) + 1;
    await saveEvals(params.id, { ...ev, dataset_version: dataset.version, dataset_counts: counts });
    const next = { ...ops, cases_added: [...ops.cases_added, { run_id: Number(b.runId), case_id: caseId, at: new Date().toISOString() }] };
    await saveOps(params.id, next);
    return NextResponse.json({ ops: next, case: caseId, dataset_version: dataset.version });
  }
  if (b.action === "review" || b.action === "snapshot") {
    const meta = await getProject(params.id);
    if (meta?.phase_status.deployment !== "complete") return NextResponse.json({ error: "Go live in Deployment first." }, { status: 400 });
    const days = [1, 7, 30, 90].includes(Number(b.days)) ? Number(b.days) : 7;
    const stats = await runOps(ctx.dir, env, ["deploy.ops", "stats", "--days", String(days)]);
    // Stopped by the owner: save nothing.
    if (req.signal?.aborted) return NextResponse.json({ error: "Stopped." }, { status: 499 });
    const artifact = await saveArtifact({
      projectId: params.id,
      phase: "operations",
      artifactType: "ops-report",
      payload: {
        kind: "agent",
        reviewed_at: new Date().toISOString(),
        owner: ops.owner,
        oncall: ops.oncall,
        period_days: days,
        stats: stats.json,
        incidents: ops.incidents,
        cases_added: ops.cases_added,
        last_alert: ops.last_alert,
      },
      inputs: ["deploy-manifest"],
    });
    if (meta.phase_status.operations !== "complete") await completePhase(params.id, "operations");
    const st: any = stats.json ?? {};
    const snap = {
      at: new Date().toISOString(),
      days,
      runs: Number(st.runs ?? 0),
      success_rate: typeof st.success_rate === "number" ? st.success_rate : null,
      cost: typeof st.cost === "number" ? st.cost : null,
      open_incidents: ops.incidents.filter((i) => i.status === "open").length,
      cases_added: ops.cases_added.length,
    };
    await saveOps(params.id, { ...ops, snapshots: [snap, ...(ops.snapshots ?? [])].slice(0, 50) });
    return NextResponse.json({ artifact, snapshot: snap });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export const POST = attributed(handlePost);
