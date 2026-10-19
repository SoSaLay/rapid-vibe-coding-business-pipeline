import { NextRequest, NextResponse } from "next/server";
import { getDeploy, saveDeploy } from "@/lib/agent/deploy";
import { credentialsAdapter } from "@/lib/agent/registry";
import { getProjectSettings, saveProjectSettings } from "@/lib/store";
import { loadBuild, saveBuild } from "@/lib/agent/build-context";
import { getPhaseState, savePhaseState } from "@/lib/store";
import { approveDesign } from "@/lib/agent/apply-change";

/**
 * Body: { databaseUrl?, jwksUrl?, audience?, railwayUrls?: { staging?, production? }, db?: "supabase" | "neon", login?: "clerk" | "supabase-auth" }.
 * Secrets go to the credentials slot. `db` is the agent's database choice; `login` switches the approved design's login
 * (only for agents people log in to) — the page re-packages afterwards.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const creds = await credentialsAdapter(params.id);
  const patch: Record<string, string> = {};
  if (typeof b.databaseUrl === "string") {
    if (b.databaseUrl && !/^postgres(ql)?:\/\//.test(b.databaseUrl.trim())) return NextResponse.json({ error: "That isn't a Postgres connection string." }, { status: 400 });
    patch.DATABASE_URL = b.databaseUrl.trim();
  }
  if (typeof b.jwksUrl === "string") patch.AUTH_JWKS_URL = b.jwksUrl.trim();
  if (typeof b.audience === "string") patch.AUTH_AUDIENCE = b.audience.trim();
  if (Object.keys(patch).length) await creds.save(params.id, patch);
  if (b.db === "supabase" || b.db === "neon") {
    const settings = await getProjectSettings(params.id);
    await saveProjectSettings(params.id, { agentStack: { ...(settings.agentStack ?? {}), "state-db": b.db } });
  }
  if (b.login === "clerk" || b.login === "supabase-auth") {
    const ctx = await loadBuild(params.id);
    const login = ctx.design?.login;
    if (!ctx.design || !login || login.selected === "machine-key") return NextResponse.json({ error: "No one logs in to this agent." }, { status: 400 });
    if (login.selected !== b.login) {
      const version = await approveDesign(params.id, { ...ctx.design, login: { ...login, selected: b.login } });
      // Login lives in the deployed server's settings, not the agent's code: the build and its review still hold.
      if (ctx.build && ctx.build.design_version === ctx.designVersion) await saveBuild(params.id, ctx.phase, { ...ctx.build, design_version: version });
      const sec = await getPhaseState<any>(params.id, "security");
      if (sec?.report?.design_version === ctx.designVersion) await savePhaseState(params.id, "security", { ...sec, report: { ...sec.report, design_version: version } });
    }
  }
  if (b.railwayUrls && typeof b.railwayUrls === "object") {
    const s = await getDeploy(params.id);
    const clean = (u: unknown) => (typeof u === "string" && /^https:\/\//.test(u.trim()) ? u.trim().replace(/\/$/, "") : undefined);
    s.railway_urls = { ...s.railway_urls, staging: clean(b.railwayUrls.staging) ?? s.railway_urls?.staging, production: clean(b.railwayUrls.production) ?? s.railway_urls?.production };
    await saveDeploy(params.id, s);
  }
  return NextResponse.json({ ok: true });
}
