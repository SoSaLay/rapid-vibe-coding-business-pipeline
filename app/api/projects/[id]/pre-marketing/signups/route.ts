import { NextRequest, NextResponse } from "next/server";
import { listSignups } from "@/lib/supabase";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const signups = await listSignups(params.id);
    const presale = signups.filter((s) => s.wants_presale).length;
    return NextResponse.json({
      total: signups.length,
      presale_interest: presale,
      recent: signups.slice(0, 10).map((s) => ({
        email: s.email,
        created_at: s.created_at,
        wants_presale: s.wants_presale,
        answers: s.answers,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to read signups." }, { status: 500 });
  }
}
