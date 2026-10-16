import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPhaseState, savePhaseState } from "@/lib/store";
import type { AgentDesign, KnowledgeMode } from "@/lib/agent/design";

const MODES = new Set<KnowledgeMode>(["none", "skills", "rag"]);

/** Body: { mode } · { add: { title, url } | { title, text } } · { remove: id }. Reopens the design for approval. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const state = await getPhaseState<{ design: AgentDesign; approved?: boolean }>(params.id, "agent-design");
  if (!state?.design) return NextResponse.json({ error: "Generate the design first." }, { status: 400 });
  const k = { mode: state.design.knowledge?.mode ?? "none", sources: [...(state.design.knowledge?.sources ?? [])] };
  if (MODES.has(b.mode)) k.mode = b.mode;
  if (b.add) {
    const title = String(b.add.title ?? "").trim().slice(0, 120);
    if (b.add.url) {
      const url = String(b.add.url).trim();
      if (!/^https?:\/\//.test(url)) return NextResponse.json({ error: "Use an http(s) link." }, { status: 400 });
      k.sources.push({ id: crypto.randomUUID().slice(0, 8), title: title || url, kind: "url", ref: url });
    } else if (b.add.text) {
      const text = String(b.add.text);
      if (text.length > 300_000) return NextResponse.json({ error: "That text is too long (300k characters max)." }, { status: 400 });
      k.sources.push({ id: crypto.randomUUID().slice(0, 8), title: title || "Pasted text", kind: "text", ref: text });
    }
  }
  if (b.remove) k.sources = k.sources.filter((s) => s.id !== b.remove);
  const next = {
    ...state,
    design: { ...state.design, knowledge: k, retrieval: { ...state.design.retrieval, enabled: k.mode === "rag" } },
    approved: false,
  };
  await savePhaseState(params.id, "agent-design", next);
  return NextResponse.json(next);
}
