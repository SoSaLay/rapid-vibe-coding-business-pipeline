import { NextResponse } from "next/server";
import { isSupabaseConfigured, SIGNUPS_TABLE_SQL } from "@/lib/supabase";

export async function GET() {
  return NextResponse.json({ configured: await isSupabaseConfigured(), sql: SIGNUPS_TABLE_SQL });
}
