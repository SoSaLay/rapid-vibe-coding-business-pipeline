import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, mcpToken } from "@/lib/agent/mcp-auth";
import { mcpService } from "@/lib/agent/mcp-catalog";

/**
 * GET ?provider=<catalog id>[&project=<agent id>] → { signedIn, url }: the sign-in page to open in a popup.
 * With project, the sign-in is that agent's own (it's handed to the agent, which refreshes it itself).
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("provider") ?? "";
  const project = req.nextUrl.searchParams.get("project") || undefined;
  if (!mcpService(p)) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  if (await mcpToken(p, project)) return NextResponse.json({ signedIn: true });
  try {
    return NextResponse.json({ signedIn: false, url: await authorizeUrl(p, req.nextUrl.origin, project) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't start the sign-in." }, { status: 500 });
  }
}
