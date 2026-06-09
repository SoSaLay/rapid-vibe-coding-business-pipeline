import { NextResponse } from "next/server";
import { listProviderInfo } from "@/lib/llm/registry";

export async function GET() {
  const providers = await listProviderInfo();
  return NextResponse.json({ providers });
}
