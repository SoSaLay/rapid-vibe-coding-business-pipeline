import { NextRequest, NextResponse } from "next/server";
import { getProvider, getActiveProviderId, setActiveProvider } from "@/lib/llm/registry";

/** Which engine the pipeline currently runs on. */
export async function GET() {
  return NextResponse.json({ active: getActiveProviderId() || "ai-anthropic" });
}

/** Switch the active engine — must be a known, already-connected provider. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const providerId = body.provider;
  const provider = providerId ? getProvider(providerId) : undefined;
  if (!provider) return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });
  if (!(await provider.isConfigured())) {
    return NextResponse.json({ ok: false, error: "Connect that engine before making it active." }, { status: 400 });
  }
  await setActiveProvider(providerId);
  return NextResponse.json({ ok: true, active: providerId });
}
