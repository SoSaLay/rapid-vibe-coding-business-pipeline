import { NextRequest, NextResponse } from "next/server";
import { applyEvalFix, applyEvalFixes, explainEvalFix, explainEvalFixes, type EvalFixTarget } from "@/lib/agent/eval-fix";
import { startAutoflow } from "@/lib/agent/autoflow";

const parse = (t: any): EvalFixTarget | null =>
  t?.kind === "category" && typeof t.category === "string"
    ? { kind: "category", category: t.category }
    : t?.kind === "gate" && Number.isInteger(t.index)
      ? { kind: "gate", index: t.index }
      : null;

/**
 * Body: { target, step: "explain" | "apply" } for one row, or { targets: [...], step: "explain-all" | "apply-all" } for Fix all.
 * target = { kind: "category", category } | { kind: "gate", index }.
 * explain → { explanation, plan, fixable }; apply → { fixed, summary }; explain-all → { items }; apply-all → { results }.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  if (b.step === "explain-all" || b.step === "apply-all") {
    const targets = (Array.isArray(b.targets) ? b.targets : []).map(parse).filter(Boolean) as EvalFixTarget[];
    if (!targets.length) return NextResponse.json({ error: "Nothing to fix." }, { status: 400 });
    try {
      if (b.step === "explain-all") {
        return NextResponse.json({ items: await explainEvalFixes(params.id, targets) });
      }
      const results = await applyEvalFixes(params.id, targets);
      // One re-check for all of them: Engineering re-tests and re-reviews, then Deployment.
      const last = [...results].reverse().find((r) => r.fixed);
      if (last) startAutoflow(params.id, req.nextUrl.origin, last.version ?? undefined, { codeReady: true });
      return NextResponse.json({ results });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "That didn't work." }, { status: 400 });
    }
  }
  const target = parse(b.target);
  if (!target) return NextResponse.json({ error: "Say what to fix." }, { status: 400 });
  try {
    if (b.step === "apply") {
      const r = await applyEvalFix(params.id, target);
      // The code changed: Engineering re-tests and re-reviews it in the background, then Deployment.
      if (r.fixed) startAutoflow(params.id, req.nextUrl.origin, r.version ?? undefined, { codeReady: true });
      return NextResponse.json(r);
    }
    return NextResponse.json(await explainEvalFix(params.id, target));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "That didn't work." }, { status: 400 });
  }
}
