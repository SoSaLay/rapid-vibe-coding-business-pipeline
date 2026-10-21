import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { history, listConversations } from "@/lib/agent";

/** GET → this person's conversations; GET ?id= → one of them, message by message. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ conversations: await listConversations(userId) });
  const messages = await history(userId, id);
  if (!messages) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ messages });
}
