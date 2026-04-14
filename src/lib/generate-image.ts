/**
 * AI Image Generation using Gemini
 * Generates images for slide presentations using Gemini's image generation model.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const IMAGE_MODEL = "gemini-2.0-flash-preview-image-generation";
const TIMEOUT_MS = 20_000;
const MAX_CONCURRENT = 3;

/**
 * Generate a single image using Gemini AI.
 * Returns a base64 data URI or null on failure.
 */
export async function generateImage(
  description: string,
  apiKey: string,
): Promise<string | null> {
  if (!apiKey || !description) return null;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: IMAGE_MODEL,
      generationConfig: {
        // @ts-expect-error — responseModalities is supported but not in older type defs
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    const prompt = `Generate a professional, high-quality illustration image for a PowerPoint slide presentation. The image should be: ${description}. Style: clean, modern, professional, suitable for academic/business presentation backgrounds. No text, no watermarks, no borders. Aspect ratio 16:9.`;

    const result = await model.generateContent(prompt);
    const candidates = result.response.candidates;
    if (!candidates || candidates.length === 0) return null;

    const parts = candidates[0].content?.parts;
    if (!parts) return null;

    for (const part of parts) {
      if (part.inlineData) {
        const { mimeType, data } = part.inlineData;
        if (data && mimeType) {
          return `data:${mimeType};base64,${data}`;
        }
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate multiple images in parallel with concurrency control.
 * Returns a Map<index, dataUri>.
 */
export async function generateImages(
  items: { index: number; description: string }[],
  apiKey: string,
): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  if (!apiKey || items.length === 0) return results;

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < items.length; i += MAX_CONCURRENT) {
    const batch = items.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (item) => {
      const dataUri = await generateImage(item.description, apiKey);
      if (dataUri) {
        results.set(item.index, dataUri);
      }
    });
    await Promise.all(promises);
  }

  return results;
}

/**
 * Get the best available API key from env or input.
 */
export function getImageApiKey(inputKeys?: string[]): string {
  const keys = [
    ...(inputKeys || []),
    process.env.GEMINI_API_KEY || "",
    ...(process.env.GEMINI_API_KEYS || "").split(/[,;\n]/),
  ]
    .map((k) => k.trim())
    .filter((k) => k.length >= 20);

  return keys[0] || "";
}
