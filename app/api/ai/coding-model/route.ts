import { NextRequest, NextResponse } from "next/server";
import { getCodingModel, setCodingModel } from "@/lib/llm/coding";

export async function GET() {
  return NextResponse.json({ model: await getCodingModel() });
}

/** Body: { model } — a model id such as claude-fable-5-1 or gpt-5.5; empty resets to the AI engine. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const r = await setCodingModel(String(body.model ?? ""));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
