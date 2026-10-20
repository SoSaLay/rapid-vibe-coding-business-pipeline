import { NextResponse } from "next/server";
import { quickstartStatus, startGithub } from "@/lib/quickstart";

/** Quick start for github: POST starts the browser sign-in; GET reports how it's going. */
export async function POST() {
  return NextResponse.json(await startGithub());
}

export async function GET() {
  return NextResponse.json(quickstartStatus("github") ?? { state: "idle" });
}
