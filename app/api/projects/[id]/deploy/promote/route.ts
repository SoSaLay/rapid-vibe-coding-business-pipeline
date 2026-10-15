import { NextRequest, NextResponse } from "next/server";
import { loadBuild } from "@/lib/agent/build-context";
import { chosenHost, deployEnv, getDeploy, hostCredentials, saveDeploy, type Release } from "@/lib/agent/deploy";
import { runtimeAdapter } from "@/lib/agent/adapters/runtime";
import { completePhase, getProject, latestArtifact, saveArtifact } from "@/lib/store";

/**
 * Body: { action: "promote" } — owner approval: production → the checked staging release.
 *       { action: "rollback" } — production → the release before the current one.
 * The first successful promotion records the deploy-manifest and completes the stage.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const ctx = await loadBuild(params.id);
  const s = await getDeploy(params.id);
  const host = await chosenHost(params.id);
  const creds = await hostCredentials(host);
  if (!ctx.design || !creds) return NextResponse.json({ error: "Host not connected." }, { status: 400 });

  let release: Release | undefined;
  if (body.action === "rollback") {
    const live = s.production?.release.id;
    const promoted = s.history.filter((h) => h.ok && h.env === "production" && h.id !== live);
    release = promoted[promoted.length - 1];
    if (!release) return NextResponse.json({ error: "There's no earlier production release to roll back to." }, { status: 400 });
  } else {
    // Railway without a staging environment ships straight to production; approving then just signs it off.
    const candidate = s.staging?.release ?? (host === "railway" ? s.production?.release : undefined);
    if (!candidate) return NextResponse.json({ error: "Release to staging first." }, { status: 400 });
    if (s.check?.release !== candidate.id || !s.check.passed) {
      return NextResponse.json({ error: "Run the live check on this staging release first; it must pass." }, { status: 400 });
    }
    release = candidate;
  }

  const agentEnv = await deployEnv({ projectId: params.id, design: ctx.design, slug: ctx.slug, host });
  const alreadyLive = body.action !== "rollback" && s.production?.release.id === release.id;
  const r = alreadyLive
    ? { ok: true, log: "Already live in production; approval recorded.", target: s.production!.target, version: release.version }
    : await runtimeAdapter(host).promote({ dir: ctx.dir, slug: ctx.slug, release, agentEnv, creds, urls: s.railway_urls });
  const entry: Release = { ...release, env: "production", at: new Date().toISOString(), ok: r.ok, log: r.log.slice(-3000), version: r.version ?? release.version };
  const next = { ...s, history: [...s.history, entry].slice(-30) };
  if (r.ok && r.target) {
    next.production = { release: entry, target: r.target };
    next.approvals = [...(s.approvals ?? []), { release: release.id, at: entry.at, by: body.action === "rollback" ? "owner (rollback)" : "owner" }];
  }
  await saveDeploy(params.id, next);
  if (!r.ok) return NextResponse.json({ error: "Production update failed.", log: r.log.slice(-3000) }, { status: 500 });

  const meta = await getProject(params.id);
  if (meta?.phase_status.deployment !== "complete") {
    const security = (await latestArtifact(params.id, "security-report"))?.payload as any;
    await saveArtifact({
      projectId: params.id,
      phase: "deployment",
      artifactType: "deploy-manifest",
      payload: {
        kind: "agent",
        host,
        production: next.production,
        staging: next.staging,
        login: ctx.design.login?.selected ?? "machine-key",
        releases: next.history,
        rollback: "Deployment → Roll back (production → previous release)",
        // The checks Security deferred to deployment, now configured on the live runtime.
        security_at_deployment: (security?.checks ?? [])
          .filter((c: any) => c.status === "deferred")
          .map((c: any) => ({ id: c.id, label: c.label, status: "configured", detail: deferredDetail(c.id, ctx.design!.login?.selected) })),
      },
      inputs: ["qa-report", "build-manifest"],
    });
    await completePhase(params.id, "deployment");
  }
  return NextResponse.json({ production: next.production });
}

function deferredDetail(id: string, login?: string) {
  const machine = !login || login === "machine-key";
  if (id === "user-auth") return machine ? "Machine key / AWS IAM on every request; no human users." : `Every request needs a verified ${login} login token.`;
  if (id === "isolation") return "Conversations are stored under '<user id>:<conversation id>'; one user can't read or resume another's.";
  if (id === "tool-authz") return "Each tool call checks the caller's roles (TOOL_ROLES), plus the kill switch and a per-run tool-call cap.";
  return "Configured.";
}
