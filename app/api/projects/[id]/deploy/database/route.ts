import { NextRequest, NextResponse } from "next/server";
import { loadBuild } from "@/lib/agent/build-context";
import { getDeploy, saveDeploy } from "@/lib/agent/deploy";
import { credentialsAdapter } from "@/lib/agent/registry";
import { scrub, sh, uvBin } from "@/lib/agent/proc";

/** Create the agent's tables in its Postgres (safe to re-run). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
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
