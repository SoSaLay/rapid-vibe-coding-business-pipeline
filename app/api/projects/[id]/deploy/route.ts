import { NextRequest, NextResponse } from "next/server";
import { chosenHost, getDeploy, hostCredentials } from "@/lib/agent/deploy";
import { credentialsAdapter } from "@/lib/agent/registry";
import { loadBuild } from "@/lib/agent/build-context";
import { promises as fs } from "fs";
import { neonKey, supabaseToken } from "@/lib/agent/db-provision";
import { getProjectSettings } from "@/lib/store";
import path from "path";

/** Deployment status for the page. Never returns secret values. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadBuild(params.id);
  const host = await chosenHost(params.id);
  const env = await (await credentialsAdapter(params.id)).envFor(params.id);
  const prepared = await fs.access(path.join(ctx.dir, "server.py")).then(() => true).catch(() => false);
  return NextResponse.json({
    state: await getDeploy(params.id),
    host,
    login: ctx.design?.login?.selected ?? "machine-key",
    db: (await getProjectSettings(params.id)).agentStack?.["state-db"] === "neon" ? "neon" : "supabase",
    hostConnected: !!(await hostCredentials(host)),
    hasDatabaseUrl: !!env.DATABASE_URL,
    neonConnected: !!(await neonKey()),
    supabaseConnected: !!(await supabaseToken()),
    hasJwks: !!env.AUTH_JWKS_URL,
    prepared,
    workspace: ctx.dir,
  });
}
