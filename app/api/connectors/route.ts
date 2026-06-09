import { NextResponse } from "next/server";
import { listConnectorInfo } from "@/lib/connectors/registry";

export async function GET() {
  const connectors = await listConnectorInfo();
  return NextResponse.json({ connectors });
}
