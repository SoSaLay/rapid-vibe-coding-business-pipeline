import { NextRequest, NextResponse } from "next/server";
import { setArchived } from "@/lib/store";

/** Archive / unarchive a project from the dashboard. Flag-only — nothing is deleted. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const archived = body.archived !== false;
  const project = await setArchived(params.id, archived);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project }, { status: 200 });
}
