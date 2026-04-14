import { NextRequest } from "next/server";
import { AppError, ValidationAppError } from "@/lib/errors";
import { analyzeCodeSchema, CodeAnalysisResponse } from "@/lib/schemas";
import { analyzeCode } from "@/lib/code/gemini-code";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status = 500, code = "INTERNAL_ERROR") {
  return Response.json({ error: { message, code } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = analyzeCodeSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationAppError(parsed.error.issues[0]?.message || "Dữ liệu đầu vào không hợp lệ.");
    }

    const analysis = await analyzeCode(parsed.data);

    const response: CodeAnalysisResponse = { analysis };

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
