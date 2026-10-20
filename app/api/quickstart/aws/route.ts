import { NextResponse } from "next/server";
import { quickstartStatus, startAws } from "@/lib/quickstart";

/** Quick start for aws: POST starts the browser sign-in; GET reports how it's going. */
export async function POST() {
  return NextResponse.json(await startAws());
}

export async function GET() {
  return NextResponse.json(quickstartStatus("aws") ?? { state: "idle" });
}
