import { NextResponse } from "next/server";
import { isExaConfigured } from "@/lib/exa";

export async function GET() {
  return NextResponse.json({ configured: await isExaConfigured() });
}
