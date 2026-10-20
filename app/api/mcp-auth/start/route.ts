import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, mcpToken, type McpProvider } from "@/lib/agent/mcp-auth";

/** GET ?provider=neon|supabase → { signedIn, url } — the sign-in page to open in a popup. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("provider") as McpProvider;
  if (p !== "neon" && p !== "supabase") return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  if (await mcpToken(p)) return NextResponse.json({ signedIn: true });
  try {
    return NextResponse.json({ signedIn: false, url: await authorizeUrl(p, req.nextUrl.origin) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't start the sign-in." }, { status: 500 });
  }
}
