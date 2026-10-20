import { NextRequest, NextResponse } from "next/server";
import { setSpendBudget, spendStatus } from "@/lib/agent/spend";

/** GET ?project=id → that agent's AI spend this month (development + testing) and its testing budget. POST { project, budget }. */
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) return NextResponse.json({ error: "Which agent?" }, { status: 400 });
  return NextResponse.json(await spendStatus(project));
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (typeof b.project !== "string") return NextResponse.json({ error: "Which agent?" }, { status: 400 });
  const n = b.budget === null || b.budget === "" ? null : Number(b.budget);
  if (n !== null && !(n >= 0)) return NextResponse.json({ error: "Enter an amount in dollars." }, { status: 400 });
  await setSpendBudget(b.project, n);
  return NextResponse.json(await spendStatus(b.project));
}
