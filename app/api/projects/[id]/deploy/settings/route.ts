import { NextRequest, NextResponse } from "next/server";
import { getDeploy, saveDeploy } from "@/lib/agent/deploy";
import { credentialsAdapter } from "@/lib/agent/registry";

/** Body: { databaseUrl?, jwksUrl?, audience?, railwayUrls?: { staging?, production? } }. Secrets go to the credentials slot. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const creds = await credentialsAdapter(params.id);
  const patch: Record<string, string> = {};
  if (typeof b.databaseUrl === "string") {
    if (b.databaseUrl && !/^postgres(ql)?:\/\//.test(b.databaseUrl.trim())) return NextResponse.json({ error: "That isn't a Postgres connection string." }, { status: 400 });
    patch.DATABASE_URL = b.databaseUrl.trim();
  }
  if (typeof b.jwksUrl === "string") patch.AUTH_JWKS_URL = b.jwksUrl.trim();
  if (typeof b.audience === "string") patch.AUTH_AUDIENCE = b.audience.trim();
  if (Object.keys(patch).length) await creds.save(params.id, patch);
  if (b.railwayUrls && typeof b.railwayUrls === "object") {
    const s = await getDeploy(params.id);
    const clean = (u: unknown) => (typeof u === "string" && /^https:\/\//.test(u.trim()) ? u.trim().replace(/\/$/, "") : undefined);
    s.railway_urls = { ...s.railway_urls, staging: clean(b.railwayUrls.staging) ?? s.railway_urls?.staging, production: clean(b.railwayUrls.production) ?? s.railway_urls?.production };
    await saveDeploy(params.id, s);
  }
  return NextResponse.json({ ok: true });
}
