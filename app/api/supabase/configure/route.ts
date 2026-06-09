import { NextRequest, NextResponse } from "next/server";
import { configureSupabase, SIGNUPS_TABLE_SQL } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await configureSupabase({
    url: body.url || "",
    anonKey: body.anonKey || "",
    serviceKey: body.serviceKey || "",
  });
  return NextResponse.json({ ...result, sql: SIGNUPS_TABLE_SQL }, { status: result.ok ? 200 : 400 });
}
