import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/llm/registry";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const providerId = body.provider || "ai-anthropic";
  const provider = getProvider(providerId);
  if (!provider) return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 404 });
  const result = await provider.configure(body.credentials ?? {});
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
