import { NextResponse } from "next/server";
import { frameworkCatalog } from "@/lib/frameworks";

export async function GET() {
  const frameworks = await frameworkCatalog();
  return NextResponse.json({ frameworks });
}
