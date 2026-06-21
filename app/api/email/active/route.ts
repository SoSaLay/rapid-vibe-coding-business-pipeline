import { NextResponse } from "next/server";
import { activeEmailProvider, listEmailProviderInfo } from "@/lib/email/registry";

/** Email-provider connection status for the UI. */
export async function GET() {
  const provider = activeEmailProvider();
  const [configured, providers] = await Promise.all([
    provider.isConfigured(),
    listEmailProviderInfo(),
  ]);
  return NextResponse.json({ active: provider.id, configured, providers });
}
