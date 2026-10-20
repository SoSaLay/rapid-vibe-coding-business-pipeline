import { NextRequest, NextResponse } from "next/server";
import { getDeploy, saveDeploy } from "@/lib/agent/deploy";

/** Record the most recent deployment action's outcome. Body: { what, ok, at, error?, log?, plain? }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  if (typeof b.what !== "string" || typeof b.ok !== "boolean") return NextResponse.json({ error: "Bad event." }, { status: 400 });
  const s = await getDeploy(params.id);
  const ev = {
    what: b.what.slice(0, 120),
    ok: b.ok,
    at: typeof b.at === "string" ? b.at : new Date().toISOString(),
    ...(b.error ? { error: String(b.error).slice(0, 500) } : {}),
    ...(b.log ? { log: String(b.log).slice(-8000) } : {}),
    ...(b.plain?.line ? { plain: { who: b.plain.who, line: String(b.plain.line).slice(0, 400) } } : {}),
  };
  await saveDeploy(params.id, { ...s, last_event: ev });
  return NextResponse.json({ ok: true });
}
