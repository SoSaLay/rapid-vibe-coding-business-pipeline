import { NextRequest, NextResponse } from "next/server";
import { configureGithub } from "@/lib/github/import";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await configureGithub(body.token || body.credentials?.token || "");
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
