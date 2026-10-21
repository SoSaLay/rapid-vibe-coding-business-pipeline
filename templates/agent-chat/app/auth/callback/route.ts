import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/auth";

/** Where the Supabase email link lands: finish signing in, then open the chat. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) await supabaseServer().auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL("/", req.url));
}
