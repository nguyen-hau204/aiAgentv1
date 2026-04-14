import { NextRequest } from "next/server";
import { generateImage, getImageApiKey } from "@/lib/generate-image";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description, apiKeys } = body as {
      description?: string;
      apiKeys?: string[];
    };

    if (!description || description.trim().length < 5) {
      return Response.json(
        { error: { message: "Missing image description." } },
        { status: 400 },
      );
    }

    const apiKey = getImageApiKey(apiKeys);
    if (!apiKey) {
      return Response.json(
        { error: { message: "No API key available for image generation." } },
        { status: 400 },
      );
    }

    const imageBase64 = await generateImage(description.trim(), apiKey);

    if (!imageBase64) {
      return Response.json(
        { error: { message: "Failed to generate image." } },
        { status: 500 },
      );
    }

    return Response.json({ imageBase64 }, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    return Response.json(
      { error: { message: error instanceof Error ? error.message : "Unknown error." } },
      { status: 500 },
    );
  }
}
