import { NextRequest } from "next/server";
import { AppError, ValidationAppError } from "@/lib/errors";
import { renderDeckToBuffer } from "@/lib/pptx/create-presentation";
import type { AiDeck, EditDeckRequest, EditDeckResponse } from "@/lib/schemas";
import { editDeckByCommand } from "@/lib/edit-deck";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status = 500, code = "INTERNAL_ERROR") {
  return new Response(JSON.stringify({ error: { message, code } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function isAiDeck(value: unknown): value is AiDeck {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as AiDeck).slides) &&
      typeof (value as AiDeck).title === "string" &&
      typeof (value as AiDeck).slideCount === "number",
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<EditDeckRequest>;
    if (!body || typeof body.command !== "string" || body.command.trim().length < 4) {
      throw new ValidationAppError("Hãy nhập lệnh sửa slide rõ ràng.");
    }
    if (!isAiDeck(body.deck)) {
      throw new ValidationAppError("Thiếu dữ liệu deck để chỉnh sửa.");
    }

    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const { deck: editedDeck, editedSlideNumber } = await editDeckByCommand(body.deck, body.command, {
      apiKey: apiKey || undefined,
    });

    const { buffer, fileName, themeName, mode, theme } = await renderDeckToBuffer(editedDeck, {
      command: editedDeck.title,
      slideCount: editedDeck.slides.length,
      language: "Tiếng Việt",
      groupName: "",
      members: "",
      apiKeys: [],
    });

    const response: EditDeckResponse = {
      title: editedDeck.title,
      subtitle: editedDeck.subtitle,
      slideCount: editedDeck.slides.length,
      slides: editedDeck.slides,
      references: editedDeck.references,
      pptxBase64: buffer.toString("base64"),
      fileName,
      theme: { name: themeName, mode, ...theme },
      editedSlideNumber,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode, error.code);
    }
    return jsonError(error instanceof Error ? error.message : "Lỗi không xác định.", 500);
  }
}
