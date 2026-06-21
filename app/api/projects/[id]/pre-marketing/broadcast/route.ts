import { NextRequest, NextResponse } from "next/server";
import { activeEmailProvider } from "@/lib/email/registry";
import { listSignups } from "@/lib/supabase";
import { getPhaseState, savePhaseState, getProject } from "@/lib/store";

/**
 * Pre-Marketing broadcast hub — the orchestrator-side manual email tool.
 *
 *   GET                 → connection status, synced count, last broadcast stats, a seed subject/body.
 *   POST action=sync    → pull the Supabase waitlist into a Resend audience.
 *   POST action=test    → send a one-off test email to the founder's own inbox.
 *   POST action=send    → compose + send a broadcast to the synced audience.
 *
 * One umbrella covers waitlist updates, launch announcements, and "new feature
 * is out" product notifications — the founder composes and sends each by hand.
 */

interface BroadcastState {
  audienceId?: string;
  syncedCount?: number;
  lastBroadcastId?: string;
  lastSentAt?: string;
  lastSubject?: string;
}

/** Minimal, safe text→HTML: escape, then paragraphs on blank lines + <br> on newlines. */
function bodyToHtml(body: string): string {
  const esc = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = esc
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#1a1a1a;max-width:560px;margin:0 auto">${paras}</div>`;
}

async function seedFromArtifacts(projectId: string): Promise<{ subject: string; body: string }> {
  // Prefer the launch email Marketing already wrote.
  const mkt = await getPhaseState<any>(projectId, "marketing-sales");
  const wl = mkt?.plan?.waitlist_email;
  if (wl?.subject && wl?.body_markdown) return { subject: wl.subject, body: wl.body_markdown };
  // Else derive a starter from the Pre-Marketing kit positioning.
  const pre = await getPhaseState<any>(projectId, "pre-marketing");
  const pos = pre?.kit?.positioning;
  if (pos) {
    return {
      subject: pos.headline || "An update from us",
      body: `${pos.headline || ""}\n\n${pos.subheadline || ""}\n\nThanks for being on the list — more soon.`,
    };
  }
  return { subject: "", body: "" };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const provider = activeEmailProvider();
  const connected = await provider.isConfigured();
  const state = (await getPhaseState<any>(params.id, "pre-marketing"))?.broadcast as BroadcastState | undefined;
  let lastBroadcast = null;
  if (connected && state?.lastBroadcastId) {
    try {
      lastBroadcast = await provider.getBroadcast(state.lastBroadcastId);
    } catch {
      /* stats not ready yet — ignore */
    }
  }
  const seed = await seedFromArtifacts(params.id);
  return NextResponse.json({
    connected,
    from: connected ? await provider.defaultFrom() : null,
    audienceId: state?.audienceId || null,
    syncedCount: state?.syncedCount ?? null,
    lastSentAt: state?.lastSentAt || null,
    lastBroadcast,
    seed,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const provider = activeEmailProvider();

  if (!(await provider.isConfigured())) {
    return NextResponse.json({ error: "Connect Resend first." }, { status: 400 });
  }

  const phase = (await getPhaseState<any>(projectId, "pre-marketing")) || {};
  const bstate: BroadcastState = phase.broadcast || {};

  try {
    if (action === "test") {
      const to = (body.to || "").trim();
      if (!to) return NextResponse.json({ error: "Enter an email to send the test to." }, { status: 400 });
      const from = await provider.defaultFrom();
      const r = await provider.sendEmail({
        from,
        to,
        subject: body.subject?.trim() || "Test from your pipeline",
        html: bodyToHtml(body.body?.trim() || "This is a test email from your Rapid Vibe Coding pipeline."),
      });
      if (!r.ok) return NextResponse.json({ error: r.error || "Test send failed." }, { status: 400 });
      return NextResponse.json({ ok: true, id: r.id, from });
    }

    if (action === "sync") {
      const project = await getProject(projectId);
      const signups = await listSignups(projectId);
      const audienceId = await provider.ensureAudience(project?.title || `Project ${projectId}`);
      const synced = await provider.syncContacts(
        audienceId,
        signups.map((s) => ({ email: s.email }))
      );
      bstate.audienceId = audienceId;
      bstate.syncedCount = synced;
      await savePhaseState(projectId, "pre-marketing", { ...phase, broadcast: bstate });
      return NextResponse.json({ ok: true, audienceId, syncedCount: synced, totalSignups: signups.length });
    }

    if (action === "send") {
      const subject = (body.subject || "").trim();
      const text = (body.body || "").trim();
      if (!subject || !text) return NextResponse.json({ error: "Subject and body are both required." }, { status: 400 });
      if (!bstate.audienceId) return NextResponse.json({ error: "Sync your audience first." }, { status: 400 });
      const from = await provider.defaultFrom();
      const broadcastId = await provider.createBroadcast({
        audienceId: bstate.audienceId,
        from,
        subject,
        html: bodyToHtml(text),
      });
      const sent = await provider.sendBroadcast(broadcastId);
      if (!sent.ok) return NextResponse.json({ error: sent.error || "Broadcast send failed." }, { status: 400 });
      bstate.lastBroadcastId = broadcastId;
      bstate.lastSentAt = new Date().toISOString();
      bstate.lastSubject = subject;
      await savePhaseState(projectId, "pre-marketing", { ...phase, broadcast: bstate });
      return NextResponse.json({ ok: true, broadcastId });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Email request failed." }, { status: 500 });
  }
}
