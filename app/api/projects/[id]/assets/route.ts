import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { assetFilePath, listAssets, type AssetKind } from "@/lib/brand-assets";

const MIME: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp4: "video/mp4",
};

/**
 * Serve a generated brand asset: ?file=<name> (+ &download=1).
 * Or list the manifest: ?kind=<kind> (or no params) → { assets: BrandAsset[] }.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const file = (req.nextUrl.searchParams.get("file") || "").replace(/[^a-z0-9._-]/gi, "");
  if (!file) {
    const kind = req.nextUrl.searchParams.get("kind") as AssetKind | null;
    const assets = await listAssets(params.id, kind || undefined);
    return NextResponse.json({ assets });
  }
  const ext = file.split(".").pop()?.toLowerCase() || "";
  try {
    const buf = await fs.readFile(assetFilePath(params.id, file));
    const headers: Record<string, string> = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (req.nextUrl.searchParams.get("download")) headers["Content-Disposition"] = `attachment; filename="${file}"`;
    return new NextResponse(new Uint8Array(buf), { headers });
  } catch {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}
