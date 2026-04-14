import { NextRequest } from "next/server";
import { generateDeckOutline } from "@/lib/gemini";
import { AppError, ValidationAppError } from "@/lib/errors";
import { renderDeckToBuffer } from "@/lib/pptx/create-presentation";
import { generatePresentationSchema, PreviewResponse } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status = 500, code = "INTERNAL_ERROR") {
  return Response.json({ error: { message, code } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = generatePresentationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationAppError(parsed.error.issues[0]?.message || "Dữ liệu đầu vào không hợp lệ.");
    }

    const deck = await generateDeckOutline(parsed.data);
    const { buffer, fileName, themeName, mode, theme } = await renderDeckToBuffer(deck, parsed.data, parsed.data.apiKeys);

    const response: PreviewResponse = {
      title: deck.title,
      subtitle: deck.subtitle,
      slideCount: deck.slides.length,
      slides: deck.slides,
      references: deck.references,
      pptxBase64: buffer.toString("base64"),
      fileName,
      theme: { name: themeName, mode, ...theme },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode, error.code);
    }
    return jsonError(error instanceof Error ? error.message : "Lỗi không xác định.", 500);
  }
}
