/**
 * Sign in to a service's MCP server in a popup (lib/agent/mcp-auth.ts). With `project`, the sign-in is that
 * agent's own. Call it straight from a click: the window opens first (so pop-up blockers allow it), then
 * goes to the provider's sign-in page.
 */
export async function mcpSignIn(provider: string, project?: string): Promise<{ ok: boolean; error?: string }> {
  const q = `/api/mcp-auth/start?provider=${encodeURIComponent(provider)}${project ? `&project=${encodeURIComponent(project)}` : ""}`;
  const win = window.open("about:blank", "mcp-signin", "width=520,height=720");
  const d = await fetch(q).then((r) => r.json()).catch(() => ({ error: "Couldn't start the sign-in." }));
  if (d.signedIn) {
    win?.close();
    return { ok: true };
  }
  if (!d.url) {
    win?.close();
    return { ok: false, error: d.error || "Couldn't start the sign-in." };
  }
  if (!win) return { ok: false, error: "Your browser blocked the sign-in window. Allow pop-ups for this page and try again." };
  win.location.href = d.url;
  const ok = await new Promise<boolean>((resolve) => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.type !== "mcp-auth") return;
      window.removeEventListener("message", onMsg);
      clearInterval(t);
      resolve(!!e.data.ok);
    };
    window.addEventListener("message", onMsg);
    const t = setInterval(() => {
      if (win.closed) {
        clearInterval(t);
        window.removeEventListener("message", onMsg);
        resolve(false);
      }
    }, 800);
  });
  if (ok) return { ok: true };
  // The window may have closed right after a successful sign-in: check before giving up.
  const again = await fetch(q).then((r) => r.json()).catch(() => ({}));
  return again.signedIn ? { ok: true } : { ok: false, error: "Sign-in didn't finish. Try again." };
}
