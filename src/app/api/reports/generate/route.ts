import { NextRequest } from "next/server";
import { AppError, ValidationAppError } from "@/lib/errors";
import { generateReportSchema, ReportPreviewResponse } from "@/lib/schemas";
import { generateReportOutline } from "@/lib/word/gemini-report";
import { renderReportToBuffer } from "@/lib/word/create-report";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status = 500, code = "INTERNAL_ERROR") {
  return Response.json({ error: { message, code } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = generateReportSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationAppError(parsed.error.issues[0]?.message || "Dữ liệu đầu vào không hợp lệ.");
    }

    const report = await generateReportOutline(parsed.data);
    const { buffer, fileName } = await renderReportToBuffer(report);

    const response: ReportPreviewResponse = {
      title: report.title,
      report,
      docxBase64: buffer.toString("base64"),
      fileName,
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
