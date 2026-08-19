import { NextRequest, NextResponse } from "next/server";
import { configurePostHog } from "@/lib/posthog";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const c = body.credentials ?? body;
  const result = await configurePostHog({
    projectApiKey: c.projectApiKey || "",
    host: c.host || "",
    personalApiKey: c.personalApiKey || "",
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
