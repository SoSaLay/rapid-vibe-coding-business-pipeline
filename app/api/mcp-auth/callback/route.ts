import { NextRequest } from "next/server";
import { finishAuth, providerName } from "@/lib/agent/mcp-auth";

/** Where the provider's sign-in popup lands: save the sign-in, tell the page, close. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  let ok = false;
  let text: string;
  try {
    if (q.get("error")) throw new Error(q.get("error_description") || q.get("error") || "Sign-in was cancelled.");
    const { provider: p } = await finishAuth(q.get("state") ?? "", q.get("code") ?? "");
    ok = true;
    text = `Signed in to ${providerName(p)}. You can close this window.`;
  } catch (e: any) {
    text = e?.message || "Sign-in failed.";
  }
  const safe = text.replace(/[<>&"]/g, "");
  const html = `<!doctype html><meta charset="utf-8"><title>Sign-in</title>
<body style="font-family:system-ui;background:#0b0d12;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0">
<p>${safe}</p>
<script>try{window.opener&&window.opener.postMessage({type:"mcp-auth",ok:${ok}},location.origin)}catch(e){}setTimeout(function(){window.close()},${ok ? 600 : 4000})</script>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
