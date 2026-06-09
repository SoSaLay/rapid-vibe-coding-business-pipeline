import { NextRequest, NextResponse } from "next/server";
import { getConnector } from "@/lib/connectors/registry";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const connector = getConnector(params.id);
  if (!connector) return NextResponse.json({ ok: false, error: "Unknown connector." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const result = await connector.configure(body.credentials ?? body ?? {});
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
