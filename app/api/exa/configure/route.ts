import { NextRequest, NextResponse } from "next/server";
import { configureExa } from "@/lib/exa";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await configureExa(body.apiKey || body.credentials?.apiKey || "");
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
