import { NextRequest, NextResponse } from "next/server";
import { saveConnectorConfig } from "@/lib/connectors/config";

/**
 * Connect an agent-pipeline observability tool. Body: { id: "langfuse" | "langsmith", values }.
 * Langfuse keys are verified against its public API before saving.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const v = (body.values ?? {}) as Record<string, string>;

  if (body.id === "langfuse") {
    const publicKey = (v.publicKey || "").trim();
    const secretKey = (v.secretKey || "").trim();
    const host = (v.host || "https://cloud.langfuse.com").trim().replace(/\/+$/, "");
    if (!publicKey || !secretKey) return NextResponse.json({ ok: false, error: "Both keys are required." }, { status: 400 });
    try {
      const res = await fetch(`${host}/api/public/projects`, {
        headers: { Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}` },
      });
      if (!res.ok) return NextResponse.json({ ok: false, error: `Langfuse rejected the keys (${res.status}). Check the region/host.` }, { status: 400 });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `Couldn't reach ${host}: ${e?.message || "network error"}` }, { status: 400 });
    }
    await saveConnectorConfig("langfuse", { publicKey, secretKey, host });
    return NextResponse.json({ ok: true });
  }

  if (body.id === "langsmith") {
    const apiKey = (v.apiKey || "").trim();
    if (!apiKey.startsWith("lsv2_")) return NextResponse.json({ ok: false, error: "LangSmith keys start with lsv2_." }, { status: 400 });
    await saveConnectorConfig("langsmith", { apiKey });
    return NextResponse.json({ ok: true });
  }

  if (body.id === "aws") {
    const accessKeyId = (v.accessKeyId || "").trim();
    const secretAccessKey = (v.secretAccessKey || "").trim();
    const region = (v.region || "us-east-1").trim();
    if (!/^(AKIA|ASIA)[A-Z0-9]{12,}$/.test(accessKeyId) || !secretAccessKey) {
      return NextResponse.json({ ok: false, error: "Paste an access key id (AKIA…) and its secret." }, { status: 400 });
    }
    if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) return NextResponse.json({ ok: false, error: "Region looks wrong (e.g. us-east-1)." }, { status: 400 });
    await saveConnectorConfig("aws", { accessKeyId, secretAccessKey, region });
    return NextResponse.json({ ok: true });
  }

  if (body.id === "railway") {
    const productionToken = (v.productionToken || "").trim();
    const stagingToken = (v.stagingToken || "").trim();
    if (!productionToken) return NextResponse.json({ ok: false, error: "The production project token is required." }, { status: 400 });
    await saveConnectorConfig("railway", { productionToken, stagingToken });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown tool." }, { status: 400 });
}
