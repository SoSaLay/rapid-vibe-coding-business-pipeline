import { NextResponse } from "next/server";
import { getPostHogConfig } from "@/lib/posthog";

/** Status for the onboarding panel + any phase that gates on analytics. */
export async function GET() {
  const cfg = await getPostHogConfig();
  return NextResponse.json({
    configured: !!cfg,
    host: cfg?.host ?? null,
    // Whether the pipeline can READ stats back, not just write them.
    readAccess: !!cfg?.personalApiKey,
  });
}
