/**
 * Document search (RAG) index: fetch each source, split into overlapping chunks,
 * embed with OpenAI (text-embedding-3-small), and bundle as knowledge/index.json
 * in the agent's repo. Small corpora only (a few thousand chunks), which keeps
 * the agent dependency-free and identical locally and in production.
 */

import { readConnectorConfig } from "../connectors/config";
import { credentialsAdapter } from "./registry";
import type { KnowledgeSource } from "./design";

export const EMBEDDING_MODEL = "text-embedding-3-small";

export async function embeddingsKey(projectId: string): Promise<string | null> {
  const own = (await (await credentialsAdapter(projectId)).envFor(projectId)).OPENAI_API_KEY;
  return own || (await readConnectorConfig("ai-openai"))?.apiKey || process.env.OPENAI_API_KEY || null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function chunk(text: string, size = 1200, overlap = 150): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      out.push(cur);
      cur = cur.slice(-overlap) + "\n\n" + p;
    } else cur = cur ? cur + "\n\n" + p : p;
    while (cur.length > size * 1.5) {
      out.push(cur.slice(0, size));
      cur = cur.slice(size - overlap);
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

async function embed(texts: string[], key: string): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 96) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts.slice(i, i + 96) }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    out.push(...j.data.map((d: any) => d.embedding.map((x: number) => Math.round(x * 1e5) / 1e5)));
  }
  return out;
}

export async function buildIndex(projectId: string, sources: KnowledgeSource[]) {
  const key = await embeddingsKey(projectId);
  if (!key) throw new Error("Document search needs an OpenAI key (for embeddings). Connect OpenAI in the toolbox or paste OPENAI_API_KEY under Keys this agent needs (Engineering).");
  const pieces: { source: string; text: string }[] = [];
  const problems: string[] = [];
  for (const s of sources) {
    let text = s.ref;
    if (s.kind === "url") {
      try {
        const r = await fetch(s.ref, { redirect: "follow" });
        if (!r.ok) throw new Error(String(r.status));
        const body = await r.text();
        text = /html/i.test(r.headers.get("content-type") ?? "") ? htmlToText(body) : body;
      } catch (e: any) {
        problems.push(`${s.title}: couldn't fetch (${e?.message || "error"})`);
        continue;
      }
    }
    for (const c of chunk(text)) pieces.push({ source: s.title, text: c });
  }
  if (pieces.length > 5000) throw new Error(`That's ${pieces.length} chunks; the bundled index is for small document sets (≤5000).`);
  const vectors = pieces.length ? await embed(pieces.map((p) => p.text), key) : [];
  const index = { model: EMBEDDING_MODEL, built_at: new Date().toISOString(), chunks: pieces.map((p, i) => ({ id: i, ...p, embedding: vectors[i] })) };
  return { content: JSON.stringify(index), chunks: pieces.length, problems };
}
