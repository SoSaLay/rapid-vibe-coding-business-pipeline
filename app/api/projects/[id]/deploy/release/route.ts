import { NextRequest, NextResponse } from "next/server";
import { loadBuild } from "@/lib/agent/build-context";
import { chosenHost, deployEnv, getDeploy, hostCredentials, saveDeploy, stampRelease, type Release } from "@/lib/agent/deploy";
import { runtimeAdapter } from "@/lib/agent/adapters/runtime";
import { writeCodebase } from "@/lib/phases/agent-engineering";

/** Ship the current commit to STAGING (Railway without a staging token: straight to production, checked after). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  if (!ctx.design) return NextResponse.json({ error: "Approve the Agent Design first." }, { status: 400 });
  const s = await getDeploy(params.id);
  if (!s.prepared_at) return NextResponse.json({ error: "Prepare the deploy files first." }, { status: 400 });
  if (!s.db?.ok) return NextResponse.json({ error: "Set up the state database first." }, { status: 400 });
  const host = await chosenHost(params.id);
  const creds = await hostCredentials(host);
  if (!creds) return NextResponse.json({ error: `Connect ${host === "railway" ? "Railway" : "AWS"} in the toolbox first.` }, { status: 400 });

  const env = host === "railway" && !creds.RAILWAY_TOKEN_STAGING ? "production" : "staging";
  const { id, commit } = await stampRelease(ctx.dir);
  await writeCodebase(ctx.dir, [], `release ${id}`);
  const agentEnv = await deployEnv({ projectId: params.id, design: ctx.design, slug: ctx.slug, host });
  const r = await runtimeAdapter(host).ship({ dir: ctx.dir, slug: ctx.slug, env, agentEnv, creds, urls: s.railway_urls });

  const release: Release = { id, commit, at: new Date().toISOString(), env, version: r.version, ok: r.ok, log: r.log.slice(-4000) };
  const next = { ...s, host, history: [...s.history, release].slice(-30) };
  if (r.ok && r.target) next[env] = { release, target: r.target };
  await saveDeploy(params.id, next);
  return NextResponse.json({ release, env }, { status: r.ok ? 200 : 500 });
}
