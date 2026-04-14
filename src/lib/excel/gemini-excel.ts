import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiExcelData, GenerateExcelInput } from "@/lib/schemas";
import { ConfigurationError, GenerationError } from "@/lib/errors";

const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash"];

const EXCEL_SYSTEM_PROMPT = `Bạn là chuyên gia phân tích dữ liệu và tạo bảng tính Excel. Hãy tạo dữ liệu bảng tính chuyên nghiệp.

Yêu cầu:
- Trả về DUY NHẤT một object JSON hợp lệ, không markdown.
- Dữ liệu phải thực tế, có ý nghĩa và đầy đủ.
- Số liệu phải hợp lý và có thể là số (number) hoặc chuỗi (string).

CẤU TRÚC JSON:
{
  "title": "Tên file Excel",
  "sheets": [
    {
      "name": "Tên sheet (tối đa 31 ký tự)",
      "headers": ["Cột 1", "Cột 2", "Cột 3"],
      "rows": [
        ["Giá trị 1", 100, "Text"],
        ["Giá trị 2", 200, "Text"]
      ],
      "columnWidths": [20, 15, 25],
      "summary": "Mô tả ngắn về sheet này"
    }
  ],
  "analysis": "Phân tích tổng quan về dữ liệu (nếu là phân tích file upload)"
}

Quy tắc:
- Tên sheet không quá 31 ký tự, không chứa ký tự đặc biệt []:*?/\\
- Mỗi sheet có ít nhất 5-10 dòng dữ liệu
- Headers phải rõ nghĩa
- Nếu dữ liệu là số, dùng kiểu number (không có dấu nháy)`;

function configuredApiKeys(input: GenerateExcelInput) {
  const envKeys = [process.env.GEMINI_API_KEY || "", process.env.GEMINI_API_KEYS || ""]
    .flatMap((v) => v.split(/[\n,;]/))
    .map((k) => k.trim())
    .filter(Boolean);
  const requestKeys = input.apiKeys.map((k) => k.trim()).filter(Boolean);
  return Array.from(new Set([...requestKeys, ...envKeys]));
}

function configuredModels() {
  const envModels = [process.env.GEMINI_MODEL || "", process.env.GEMINI_FALLBACK_MODELS || ""]
    .flatMap((v) => v.split(/[\n,;]/))
    .map((m) => m.trim())
    .filter(Boolean);
  return Array.from(new Set([...envModels, ...fallbackModels]));
}

function safeError(err: unknown) {
  const msg = err instanceof Error ? err.message : "Gemini API bị lỗi.";
  return msg.replace(/AIza[0-9A-Za-z_-]+/g, "[API_KEY]");
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new GenerationError("Gemini không trả về JSON hợp lệ.");
  return match[0];
}

function cleanText(v: unknown, fallback = "", max = 500) {
  return String(v ?? fallback).trim().slice(0, max);
}

function cleanSheetName(name: string): string {
  return name
    .replace(/[[\]:*?/\\]/g, "")
    .trim()
    .slice(0, 31) || "Sheet1";
}

function buildPrompt(input: GenerateExcelInput) {
  const uploadLine = input.uploadedData
    ? `\nDỮ LIỆU UPLOAD (phân tích và tạo bảng tính từ dữ liệu này):\n${input.uploadedData.slice(0, 8000)}`
    : "";

  return `${EXCEL_SYSTEM_PROMPT}

THÔNG TIN:
- Mô tả: ${input.description}
- Số sheet: ${input.sheetCount}
- Ngôn ngữ: ${input.language}${uploadLine}

Chỉ trả JSON, không markdown code fence.`;
}

function normalizeExcelData(raw: Partial<AiExcelData>, input: GenerateExcelInput): AiExcelData {
  return {
    title: cleanText(raw.title, input.description, 200),
    sheets: Array.isArray(raw.sheets)
      ? raw.sheets.map((s, i) => ({
          name: cleanSheetName(cleanText(s.name, `Sheet${i + 1}`, 31)),
          headers: Array.isArray(s.headers) ? s.headers.map((h) => cleanText(h, `Cột ${i}`, 100)) : ["Dữ liệu"],
          rows: Array.isArray(s.rows)
            ? s.rows.map((r) =>
                Array.isArray(r) ? r.map((c) => (typeof c === "number" ? c : cleanText(c, "", 500))) : [],
              )
            : [],
          columnWidths: Array.isArray(s.columnWidths)
            ? s.columnWidths.map((w) => (typeof w === "number" && w > 0 ? Math.min(w, 60) : 15))
            : undefined,
          summary: s.summary ? cleanText(s.summary, "", 500) : undefined,
        }))
      : [{ name: "Sheet1", headers: ["Dữ liệu"], rows: [["Không có dữ liệu"]] }],
    analysis: raw.analysis ? cleanText(raw.analysis, "", 3000) : undefined,
  };
}

async function generateWithKey(input: GenerateExcelInput, apiKey: string, modelName: string): Promise<AiExcelData> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
  });

  const result = await model.generateContent(buildPrompt(input));
  const parsed = JSON.parse(extractJson(result.response.text())) as Partial<AiExcelData>;
  return normalizeExcelData(parsed, input);
}

export async function generateExcelData(input: GenerateExcelInput): Promise<AiExcelData> {
  const apiKeys = configuredApiKeys(input);
  if (apiKeys.length === 0) {
    throw new ConfigurationError("Thiếu Gemini API key.");
  }

  const models = configuredModels();
  const failures: string[] = [];
  for (const key of apiKeys) {
    for (const model of models) {
      try {
        return await generateWithKey(input, key, model);
      } catch (err) {
        if (err instanceof ConfigurationError) throw err;
        failures.push(`${model}: ${safeError(err)}`);
      }
    }
  }
  throw new GenerationError(`Không thể tạo dữ liệu Excel. Lỗi cuối: ${failures.at(-1) || "N/A"}`);
}
