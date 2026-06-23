/**
 * Brand-asset layer — the per-project store for Nano Banana images and Veo
 * videos, shared by Pre-Marketing (origin), Product Design (canonical owner),
 * and Marketing & Sales (consumer).
 *
 * Assets flow FORWARD: Pre-Marketing seeds a first logo/hero/OG, Product Design
 * inherits + locks them into the design-spec brand, Marketing builds campaign
 * media on the locked brand. Everything is grounded in the SAME design tokens so
 * the landing page, the product UI, and the campaigns read as one brand.
 *
 * Files live under data/projects/<id>/assets/ with an index.json manifest.
 * Prompts are DERIVED from existing artifacts — no manual prompt entry.
 */

import { promises as fs } from "fs";
import path from "path";

export type AssetKind = "logo" | "hero" | "og" | "campaign-image" | "campaign-video";

export interface BrandAsset {
  id: string;
  kind: AssetKind;
  file: string; // filename within the assets dir
  mime: string;
  prompt: string;
  engine: string; // e.g. "nano-banana", "veo-3.1"
  phase: string; // originating phase id
  createdAt: string;
}

function assetsDir(projectId: string) {
  return path.join(process.cwd(), process.env.DATA_DIR || "data", "projects", projectId, "assets");
}
function indexPath(projectId: string) {
  return path.join(assetsDir(projectId), "index.json");
}

export function assetFilePath(projectId: string, file: string) {
  // Keep strictly inside the assets dir — file comes from our own slugging.
  const safe = file.replace(/[^a-z0-9._-]/gi, "");
  return path.join(assetsDir(projectId), safe);
}

export async function listAssets(projectId: string, kind?: AssetKind): Promise<BrandAsset[]> {
  try {
    const raw = await fs.readFile(indexPath(projectId), "utf8");
    const all = JSON.parse(raw) as BrandAsset[];
    return kind ? all.filter((a) => a.kind === kind) : all;
  } catch {
    return [];
  }
}

/** Most recent asset of a kind, or null. */
export async function latestAsset(projectId: string, kind: AssetKind): Promise<BrandAsset | null> {
  const list = await listAssets(projectId, kind);
  return list.length ? list[list.length - 1] : null;
}

async function appendIndex(projectId: string, asset: BrandAsset): Promise<void> {
  const all = await listAssets(projectId);
  all.push(asset);
  await fs.writeFile(indexPath(projectId), JSON.stringify(all, null, 2), "utf8");
}

const extFor = (mime: string) =>
  mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("mp4") ? "mp4" : "jpg";

/** Persist a base64 image (or video) and record it in the manifest. */
export async function saveAsset(args: {
  projectId: string;
  kind: AssetKind;
  base64: string;
  mime: string;
  prompt: string;
  engine: string;
  phase: string;
}): Promise<BrandAsset> {
  await fs.mkdir(assetsDir(args.projectId), { recursive: true });
  const id = `${args.kind}-${Date.now()}`;
  const file = `${id}.${extFor(args.mime)}`;
  await fs.writeFile(assetFilePath(args.projectId, file), Buffer.from(args.base64, "base64"));
  const asset: BrandAsset = {
    id,
    kind: args.kind,
    file,
    mime: args.mime,
    prompt: args.prompt,
    engine: args.engine,
    phase: args.phase,
    createdAt: new Date().toISOString(),
  };
  await appendIndex(args.projectId, asset);
  return asset;
}

/** Read an asset back as base64 (e.g. to use the logo as a Nano Banana reference). */
export async function readAssetBase64(projectId: string, file: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const buf = await fs.readFile(assetFilePath(projectId, file));
    const mime = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return { base64: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}

/* ---------------- Prompt builders (derive from artifacts — no manual entry) ---------------- */

/*
 * Prompt builders follow Google's Nano Banana guidance: narrative (not keyword
 * lists), positive framing, [Subject]+[Composition]+[Style]+[Technical] order,
 * and desired in-image text wrapped in quotes with an explicit font style.
 */

function palettePhrase(visual: Record<string, any> | undefined): string {
  const colors = (visual?.colors || []).slice(0, 5).map((c: any) => `${c.name} (${c.hex})`).join(", ");
  return colors ? `Use only this brand palette: ${colors}.` : "";
}

function personalityPhrase(branding: Record<string, any> | undefined): string {
  const p = (branding?.personality || []).join(", ");
  return p ? p : "modern and clean";
}

/** Logo prompt from the design-spec branding + visual tokens (Nano Banana Pro recommended). */
export function buildLogoPrompt(branding: Record<string, any>, visual?: Record<string, any>, direction?: string): string {
  const name = branding?.name || "the product";
  const mood = personalityPhrase(branding);
  // Grounding: what the product actually is, so the mark references the real category
  // instead of defaulting to a generic abstract swoosh.
  const what = branding?.value_proposition || branding?.what || "";
  const tagline = branding?.tagline ? `Brand essence: "${branding.tagline}".` : "";
  return [
    // Subject
    `Design a single, original brand logo: a clean vector mark paired with the wordmark "${name}"`,
    `set in a typeface that feels ${mood}.`,
    what ? `The product: ${what}. The mark should subtly evoke this, not be generic.` : "",
    tagline,
    // Chosen creative direction (takes precedence over generic defaults)
    direction || "",
    // Style / direction
    branding?.logo_direction ? `Art direction: ${branding.logo_direction}.` : "",
    `Flat vector style, crisp confident edges, generous negative space, instantly recognizable at small sizes.`,
    `Modern, premium, professional — avoid clip-art, gradients-as-crutch, drop shadows, and stocky icon clichés.`,
    palettePhrase(visual),
    // Composition / technical
    `Center the mark and wordmark on a clean solid background.`,
    `Render the text "${name}" exactly — correct spelling, sharp and legible, no extra or garbled letters.`,
    `It must work as both a website header logo and a square app icon.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Hero/OG image prompt from positioning + brand. */
export function buildHeroPrompt(args: {
  productName: string;
  headline?: string;
  problem?: string;
  audience?: string;
  /** What the product actually does — the concrete subject, so the scene isn't generic. */
  valueProp?: string;
  branding?: Record<string, any>;
  visual?: Record<string, any>;
  direction?: string;
  forOg?: boolean;
}): string {
  const mood = personalityPhrase(args.branding);
  return [
    // Subject + context
    `Create a polished, original ${args.forOg ? "social-share / Open Graph banner" : "website hero image"} for "${args.productName}",`,
    `a product ${args.audience ? `for ${args.audience}` : ""} that ${args.problem ? `relieves this pain: ${args.problem}` : "solves a real problem"}.`,
    // Concrete subject so the model has something specific to depict
    args.valueProp ? `Visually communicate the core value: ${args.valueProp}.` : "",
    // Chosen creative direction
    args.direction || "",
    // Style
    `Mood: ${mood}. A confident, on-brand hero composition — clean, premium, with intentional depth, tasteful lighting, and a single clear focal point.`,
    `Editorial product-marketing quality. Avoid generic stock photography, clip-art, busy clutter, literal emoji, and AI-slop artifacts.`,
    palettePhrase(args.visual),
    // Composition / technical + optional in-image headline
    args.forOg && args.headline
      ? `Integrate the headline "${args.headline}" exactly, in a bold legible sans-serif with strong contrast and correct spelling.`
      : `Leave clean negative space on one side for an overlaid headline. Keep the image text-free.`,
    args.forOg ? `Wide 16:9 landscape framing.` : `Wide landscape framing, web-hero proportions.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Campaign image prompt for one social post — grounded in the brand + the post's angle. */
export function buildCampaignImagePrompt(args: {
  post: { hook: string; pillar: string; channel: string };
  productName: string;
  branding?: Record<string, any>;
  visual?: Record<string, any>;
  direction?: string;
}): string {
  const mood = personalityPhrase(args.branding);
  return [
    `Create a scroll-stopping social graphic for ${args.post.channel} promoting "${args.productName}".`,
    `The post's angle: "${args.post.hook}".`,
    args.direction || "",
    `Mood: ${mood}. Original, premium, on-brand — not a generic stock photo or clip-art.`,
    palettePhrase(args.visual),
    args.post.hook ? `If text fits, integrate a short punchy version of "${args.post.hook}" in a bold legible font.` : "",
    `Composition optimized for a feed (square-ish, strong focal point, clear at thumbnail size).`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Veo prompt for a short-form video — built from the post's already-written script. */
export function buildVideoPrompt(args: {
  post: { hook: string; body: string; channel: string };
  productName: string;
  branding?: Record<string, any>;
  direction?: string;
}): string {
  const mood = personalityPhrase(args.branding);
  return [
    `Create a short, vertical (9:16) social video ad for "${args.productName}" for ${args.post.channel}.`,
    `Open on this hook: "${args.post.hook}".`,
    `Story / script beats: ${args.post.body.slice(0, 600)}.`,
    args.direction || "",
    `Tone: ${mood}. Modern, fast-paced, premium motion. On-brand throughout. End on the product name and a clear call to action.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** A copy-paste campaign brief + deep link for the Google Pomelli handoff (no API — web tool). */
export function buildPomelliHandoff(args: {
  productName: string;
  prodUrl: string;
  strategySummary?: string;
  pillars?: { name: string }[];
}): { url: string; brief: string } {
  const pillars = (args.pillars || []).map((p) => p.name).filter(Boolean).join(", ");
  const brief = [
    `Brand: ${args.productName}`,
    `Website: ${args.prodUrl}`,
    args.strategySummary ? `Positioning: ${args.strategySummary}` : "",
    pillars ? `Content themes: ${pillars}` : "",
    `Goal: generate a batch of on-brand launch campaign assets (social posts + ad creatives).`,
  ]
    .filter(Boolean)
    .join("\n");
  return { url: "https://labs.google.com/pomelli", brief };
}
