import { NextRequest, NextResponse } from "next/server";
import { configureGoogle } from "@/lib/google/genai";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await configureGoogle(body.apiKey || body.credentials?.apiKey || "");
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
