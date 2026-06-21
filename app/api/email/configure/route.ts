import { NextRequest, NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/email/registry";

/** Connect an email provider (Resend today). Body: { provider?, apiKey, fromAddress? }. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const providerId = body.provider || "resend";
  const provider = getEmailProvider(providerId);
  if (!provider) return NextResponse.json({ ok: false, error: "Unknown email provider." }, { status: 404 });
  const result = await provider.configure({
    apiKey: body.apiKey || body.credentials?.apiKey || "",
    fromAddress: body.fromAddress || body.credentials?.fromAddress || "",
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
