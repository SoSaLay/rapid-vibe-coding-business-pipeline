import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/google/genai";

/** Connection status for the Google AI (Gemini) key. */
export async function GET() {
  return NextResponse.json({ configured: await isGoogleConfigured() });
}
