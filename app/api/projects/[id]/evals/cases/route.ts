import { NextRequest, NextResponse } from "next/server";
import { tracked } from "@/lib/agent/activity";
import { changeTestCases } from "@/lib/agent/test-cases";

/**
 * Change test cases by hand. Body:
 *   { action: "remove", ids: string[] }                        — remove them (a new version; earlier ones are kept)
 *   { action: "update", id, expected?, fixtures? }             — correct one's expected outcome or test data
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "remove") {
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x: unknown) => typeof x === "string");
      if (!ids.length) return NextResponse.json({ error: "Pick the test cases to remove." }, { status: 400 });
      return NextResponse.json(await changeTestCases(params.id, ids.map((id: string) => ({ id, remove: true })), "Removed by you"));
    }
    if (b.action === "update" && typeof b.id === "string") {
      const expected = typeof b.expected === "string" ? b.expected.trim() : undefined;
      const fixtures = b.fixtures && typeof b.fixtures === "object" ? b.fixtures : undefined;
      if (!expected && !fixtures) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
      return NextResponse.json(await changeTestCases(params.id, [{ id: b.id, expected, fixtures }], "Corrected by you"));
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't change the test cases." }, { status: 400 });
  }
}

export const POST = tracked("qa", "Updating test cases", handlePost);
