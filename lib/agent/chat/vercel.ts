/**
 * Puts a chat page online on Vercel through its REST API: a project per agent, its settings as encrypted
 * environment variables, then a production deployment of the files (sent inline). Token pasted once in the app.
 */

import { readConnectorConfig, saveConnectorConfig } from "../../connectors/config";

const API = "https://api.vercel.com";

export async function vercelToken(): Promise<string | null> {
  return (await readConnectorConfig("vercel"))?.token || process.env.VERCEL_TOKEN || null;
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `Vercel said ${r.status}.`), { status: r.status });
  return j;
}

/** Check and save a Vercel token. */
export async function connectVercel(token: string): Promise<string> {
  const t = token.trim();
  const me = await call(t, "GET", "/v2/user").catch((e) => {
    throw new Error(`Vercel didn't accept that token: ${e.message}`);
  });
  await saveConnectorConfig("vercel", { token: t });
  return me?.user?.username ?? me?.user?.email ?? "your account";
}

/** Deploy `files` as project `name` with `env`; waits until it's live and returns its address. */
export async function deployToVercel(name: string, files: { file: string; data: string }[], env: Record<string, string>): Promise<{ url: string; project: string }> {
  const token = await vercelToken();
  if (!token) throw new Error("Connect Vercel first.");
  const project = await call(token, "GET", `/v9/projects/${encodeURIComponent(name)}`).catch(async (e) => {
    if (e.status !== 404) throw e;
    return call(token, "POST", "/v11/projects", { name, framework: "nextjs" });
  });
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    await call(token, "POST", `/v10/projects/${project.id}/env?upsert=true`, { key, value, type: "encrypted", target: ["production", "preview"] });
  }
  let d = await call(token, "POST", "/v13/deployments?skipAutoDetectionConfirmation=1&forceNew=1", {
    name,
    project: project.id,
    target: "production",
    files: files.map((f) => ({ file: f.file, data: Buffer.from(f.data).toString("base64"), encoding: "base64" })),
    projectSettings: { framework: "nextjs" },
  });
  // Building usually takes a minute or two.
  const until = Date.now() + 10 * 60_000;
  while (d.readyState !== "READY" && d.readyState !== "ERROR" && d.readyState !== "CANCELED" && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 5000));
    d = await call(token, "GET", `/v13/deployments/${d.id}`);
  }
  if (d.readyState !== "READY") throw new Error(`Vercel couldn't build the chat page (${d.readyState ?? "timed out"}). Open the project on vercel.com to see why.`);
  const host = (d.alias ?? []).find((a: string) => a.endsWith(".vercel.app") && !a.includes(d.id)) ?? `${name}.vercel.app`;
  return { url: `https://${host}`, project: project.id };
}
