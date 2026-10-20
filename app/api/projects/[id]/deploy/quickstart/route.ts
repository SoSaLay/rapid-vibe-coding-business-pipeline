import { NextRequest, NextResponse } from "next/server";
import { loadBuild } from "@/lib/agent/build-context";
import { credentialsAdapter } from "@/lib/agent/registry";
import { getProjectSettings, saveProjectSettings } from "@/lib/store";
import { createSupabaseDatabase } from "@/lib/agent/db-provision";
import { authorizeUrl, createNeonViaMcp, mcpToken, type McpProvider } from "@/lib/agent/mcp-auth";

/**
 * Quick start with AI (MCPs). Body: { provider: "neon" | "supabase" }.
 * Not signed in yet → { signIn: url } (open it in a popup, then call again).
 * Signed in → creates the agent's database, saves its connection string, and sets up the tables.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const p = b.provider as McpProvider;
  if (p !== "neon" && p !== "supabase") return NextResponse.json({ error: "Pick Supabase or Neon." }, { status: 400 });
  const token = await mcpToken(p);
  if (!token) return NextResponse.json({ signIn: await authorizeUrl(p, req.nextUrl.origin) });

  const ctx = await loadBuild(params.id);
  const name = `agent-${ctx.slug}`;
  try {
    const url = p === "neon" ? await createNeonViaMcp(name) : await createSupabaseDatabase(token, name);
    await (await credentialsAdapter(params.id)).save(params.id, { DATABASE_URL: url });
    const settings = await getProjectSettings(params.id);
    await saveProjectSettings(params.id, { agentStack: { ...(settings.agentStack ?? {}), "state-db": p } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't create the database." }, { status: 500 });
  }
  // Same table setup as the traditional path.
  const setup = await fetch(`${req.nextUrl.origin}/api/projects/${params.id}/deploy/database`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const d = await setup.json().catch(() => ({}));
  return NextResponse.json(d, { status: setup.status });
}
