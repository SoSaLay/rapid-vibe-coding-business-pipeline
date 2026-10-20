/**
 * Where the owner can see their agent's evaluation runs in the tracing tool (like the AWS and GitHub
 * links): Langfuse (the default) or LangSmith. Each eval run is traced there, tagged "eval".
 */

import { langfuseConfig, langsmithKey } from "./registry";

export interface EvalViewer {
  label: string;
  url: string;
}

const cache = new Map<string, string>();

export async function evalViewer(slug: string): Promise<EvalViewer | null> {
  const lf = await langfuseConfig();
  if (lf) {
    const host = lf.host.replace(/\/+$/, "");
    // Langfuse URLs need the project id: ask its API once (the keys belong to one project).
    let id = cache.get(host + lf.publicKey);
    if (!id) {
      const auth = Buffer.from(`${lf.publicKey}:${lf.secretKey}`).toString("base64");
      const j: any = await fetch(`${host}/api/public/projects`, { headers: { Authorization: `Basic ${auth}` } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      id = j?.data?.[0]?.id;
      if (id) cache.set(host + lf.publicKey, id);
    }
    return { label: "Langfuse", url: id ? `${host}/project/${id}/traces` : host };
  }
  if (await langsmithKey()) return { label: "LangSmith", url: `https://smith.langchain.com/projects?name=${encodeURIComponent(slug)}` };
  return null;
}
