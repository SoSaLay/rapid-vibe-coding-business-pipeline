/**
 * Google AI (Gemini) client — the engine behind the Stitch-mode design layer
 * and (later) Nano Banana image generation + Veo video.
 *
 * Google Stitch itself has NO public API — it's a web-only Labs product. But
 * Stitch is Gemini 2.5 under the hood, so we replicate its text→UI capability
 * by calling the Gemini REST API directly with Stitch-style prompting. One key
 * unlocks all three Google creative surfaces.
 *
 * Key is pasted in-app and stored locally (data/connectors/google-ai.json) or
 * read from GOOGLE_AI_API_KEY / GEMINI_API_KEY — never hard-coded. REST via
 * fetch (no SDK dependency), mirroring lib/exa.ts.
 */

import { readConnectorConfig, saveConnectorConfig } from "../connectors/config";

const ID = "google-ai";
const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

/** Default text model for Stitch-mode screen generation (Stitch "Standard" tier ≈ Flash). */
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
/** Nano Banana — Gemini's image generation/edit model (general brand & campaign imagery). */
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
/** Nano Banana Pro — reasoning-grade, best text rendering (logos, wordmarks, OG/posters with copy). */
export const GEMINI_IMAGE_PRO_MODEL = "gemini-3-pro-image-preview";
/** Veo 3.1 — text-to-video. Long-running: start → poll → download. */
export const GEMINI_VIDEO_MODEL = "veo-3.1-generate-preview";

async function getApiKey(): Promise<string | null> {
  const config = await readConnectorConfig(ID);
  return config?.apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || null;
}

export async function isGoogleConfigured(): Promise<boolean> {
  return !!(await getApiKey());
}

/** Validate + persist the key. A cheap models.list GET confirms it's real. */
export async function configureGoogle(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const key = apiKey?.trim();
  if (!key) return { ok: false, error: "Missing Google AI API key." };
  try {
    const res = await fetch(`${API_ROOT}/models?key=${encodeURIComponent(key)}`);
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, error: "Invalid Google AI API key." };
    }
    if (!res.ok) return { ok: false, error: `Google AI error ${res.status}.` };
    await saveConnectorConfig(ID, { apiKey: key });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach Google AI." };
  }
}

interface GeminiGenArgs {
  system: string;
  prompt: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

/**
 * Single-turn text generation via Gemini. Returns the raw model text.
 * Tolerates a MAX_TOKENS finish by returning whatever was produced.
 */
export async function geminiGenerateText(args: GeminiGenArgs): Promise<string> {
  const key = await getApiKey();
  if (!key) throw new Error("Google AI is not connected. Add your Gemini API key.");
  const model = args.model || GEMINI_TEXT_MODEL;

  const res = await fetch(`${API_ROOT}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: args.system }] },
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      generationConfig: {
        temperature: args.temperature ?? 0.7,
        maxOutputTokens: args.maxOutputTokens ?? 32768,
        responseMimeType: "text/plain",
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini ${model} error ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}.`);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => p?.text || "").join("");
  if (!text) {
    const reason = cand?.finishReason || data?.promptFeedback?.blockReason || "no output";
    throw new Error(`Gemini returned no content (${reason}).`);
  }
  return text;
}

export interface GeneratedImage {
  base64: string;
  mimeType: string;
}

interface GeminiImageArgs {
  prompt: string;
  /** Reference images to keep output on-brand (e.g. reuse the logo). Up to 14; give each a role in the prompt. */
  refImages?: { base64: string; mimeType: string }[];
  model?: string;
  /** e.g. "1:1" (logo/app icon), "16:9" (hero), "4:5" / "9:16" (social), "1.91:1"→use "16:9". */
  aspectRatio?: string;
  /** "1K" | "2K" | "4K" — Pro model honors this; 2K is a good default for crisp brand assets. */
  imageSize?: string;
}

/**
 * Nano Banana image generation. Returns the first inline image part as base64.
 * Pass refImages to keep an asset on-brand; aspectRatio/imageSize map to the
 * Gemini imageConfig. Use GEMINI_IMAGE_PRO_MODEL for anything with text.
 */
export async function geminiGenerateImage(args: GeminiImageArgs): Promise<GeneratedImage> {
  const key = await getApiKey();
  if (!key) throw new Error("Google AI is not connected. Add your Gemini API key.");
  const model = args.model || GEMINI_IMAGE_MODEL;

  const parts: any[] = [{ text: args.prompt }];
  for (const ref of args.refImages || []) {
    parts.push({ inline_data: { mime_type: ref.mimeType, data: ref.base64 } });
  }

  const imageConfig: Record<string, string> = {};
  if (args.aspectRatio) imageConfig.aspectRatio = args.aspectRatio;
  if (args.imageSize) imageConfig.imageSize = args.imageSize;

  const res = await fetch(`${API_ROOT}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      ...(Object.keys(imageConfig).length ? { generationConfig: { imageConfig } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Nano Banana ${model} error ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}.`);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  const imgPart = (cand?.content?.parts || []).find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
  const inline = imgPart?.inlineData || imgPart?.inline_data;
  if (!inline?.data) {
    const reason = cand?.finishReason || data?.promptFeedback?.blockReason || "no image";
    throw new Error(`Nano Banana returned no image (${reason}).`);
  }
  return { base64: inline.data, mimeType: inline.mimeType || inline.mime_type || "image/png" };
}

/* ---------------- Veo 3.1 video (long-running) ---------------- */

export interface VeoPollResult {
  done: boolean;
  /** Files-API URI of the finished video, when done. */
  uri?: string;
  error?: string;
}

/** Kick off a Veo render. Returns the long-running operation name to poll. */
export async function veoStartVideo(args: {
  prompt: string;
  aspectRatio?: string; // "16:9" | "9:16"
  model?: string;
}): Promise<string> {
  const key = await getApiKey();
  if (!key) throw new Error("Google AI is not connected. Add your Gemini API key.");
  const model = args.model || GEMINI_VIDEO_MODEL;

  const res = await fetch(`${API_ROOT}/models/${model}:predictLongRunning?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: args.prompt }],
      parameters: { ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}) },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Veo ${model} error ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}.`);
  }
  const data = await res.json();
  if (!data?.name) throw new Error("Veo did not return an operation name.");
  return data.name as string;
}

/** Poll a Veo operation. When done, returns the video URI (tolerant of field-name variants). */
export async function veoPollVideo(operationName: string): Promise<VeoPollResult> {
  const key = await getApiKey();
  if (!key) throw new Error("Google AI is not connected. Add your Gemini API key.");

  const res = await fetch(`${API_ROOT}/${operationName}?key=${encodeURIComponent(key)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Veo poll error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`);
  }
  const data = await res.json();
  if (!data?.done) return { done: false };
  if (data.error) return { done: true, error: data.error?.message || "Veo generation failed." };

  const r = data.response?.generateVideoResponse || data.response || {};
  const sample = (r.generatedSamples || r.generated_samples || [])[0] || (r.generatedVideos || [])[0];
  const uri = sample?.video?.uri || sample?.video?.url || sample?.uri;
  if (!uri) return { done: true, error: "Veo finished but returned no video URI." };
  return { done: true, uri };
}

/** Download a Gemini Files-API resource (e.g. a finished Veo video) as base64. */
export async function geminiFetchFileBase64(uri: string): Promise<{ base64: string; mime: string }> {
  const key = await getApiKey();
  if (!key) throw new Error("Google AI is not connected. Add your Gemini API key.");
  const sep = uri.includes("?") ? "&" : "?";
  const res = await fetch(`${uri}${sep}key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`Could not download video (${res.status}).`);
  const mime = res.headers.get("content-type") || "video/mp4";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mime };
}
