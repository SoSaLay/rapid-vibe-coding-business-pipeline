import { NextRequest, NextResponse } from "next/server";
import { loadBuild } from "@/lib/agent/build-context";
import { getDeploy, saveDeploy } from "@/lib/agent/deploy";
import { credentialsAdapter } from "@/lib/agent/registry";
import { scrub, sh, uvBin } from "@/lib/agent/proc";
import { createNeonDatabase, neonKey } from "@/lib/agent/db-provision";
import { readConnectorConfig } from "@/lib/connectors/config";

/**
 * Create the agent's tables in its Postgres (safe to re-run).
 * Body { create: "neon" } first creates a free Neon database for this agent and saves its connection string.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const ctx = await loadBuild(params.id);
  if (body.create === "neon") {
    const key = await neonKey();
    if (!key) return NextResponse.json({ error: "Add a Neon API key in onboarding first." }, { status: 400 });
    try {
      const url = await createNeonDatabase(key, `agent-${ctx.slug}`, (await readConnectorConfig("neon"))?.orgId || undefined);
      await (await credentialsAdapter(params.id)).save(params.id, { DATABASE_URL: url });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Couldn't create the database." }, { status: 500 });
    }
  }
  const env = await (await credentialsAdapter(params.id)).envFor(params.id);
  if (!env.DATABASE_URL) return NextResponse.json({ error: "Paste the database connection string first." }, { status: 400 });
  const r = await sh(uvBin(), ["run", "python", "-m", "deploy.state", "setup"], {
    cwd: ctx.dir,
    env: { DATABASE_URL: env.DATABASE_URL, AGENT_NAME: ctx.slug },
    timeoutMs: 3 * 60_000,
  });
  const s = await getDeploy(params.id);
  const db = { ok: r.ok, at: new Date().toISOString(), error: r.ok ? undefined : scrub(r.out, [env.DATABASE_URL]).slice(-1500) };
  await saveDeploy(params.id, { ...s, db });
  return NextResponse.json({ db }, { status: r.ok ? 200 : 500 });
}
