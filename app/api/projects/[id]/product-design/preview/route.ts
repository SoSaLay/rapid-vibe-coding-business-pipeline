import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

/** Serve a generated screen mockup: ?screen=<id> (+ &download=1 to download). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const screen = (req.nextUrl.searchParams.get("screen") || "").replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!screen) return NextResponse.json({ error: "Missing ?screen=<id>." }, { status: 400 });
  const file = path.join(process.cwd(), "data", "projects", params.id, "mockups", `${screen}.html`);
  try {
    const html = await fs.readFile(file, "utf8");
    const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
    if (req.nextUrl.searchParams.get("download")) {
      headers["Content-Disposition"] = `attachment; filename="${screen}.html"`;
    }
    return new NextResponse(html, { headers });
  } catch {
    return NextResponse.json({ error: "No mockup generated for that screen yet." }, { status: 404 });
  }
}
