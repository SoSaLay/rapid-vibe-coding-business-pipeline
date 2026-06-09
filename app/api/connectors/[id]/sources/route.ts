import { NextRequest, NextResponse } from "next/server";
import { getConnector } from "@/lib/connectors/registry";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const connector = getConnector(params.id);
  if (!connector) return NextResponse.json({ error: "Unknown connector." }, { status: 404 });
  if (!(await connector.isConfigured())) {
    return NextResponse.json({ error: "Connector not configured.", sources: [] }, { status: 400 });
  }
  try {
    const sources = await connector.listSources();
    return NextResponse.json({ sources });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list sources.", sources: [] }, { status: 500 });
  }
}
