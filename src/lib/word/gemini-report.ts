import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiReport, GenerateReportInput } from "@/lib/schemas";
import { ConfigurationError, GenerationError } from "@/lib/errors";

const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash"];

const REPORT_SYSTEM_PROMPT = `Bạn là chuyên gia viết báo cáo học thuật & kỹ thuật, phong cách chuyên nghiệp, trình bày rõ ràng.

Yêu cầu:
- Trả về DUY NHẤT một object JSON hợp lệ, không markdown hay text ngoài JSON.
- Viết nội dung chất lượng cao, có chiều sâu, đúng chủ đề.
- Mỗi section phải có ít nhất 2-3 đoạn văn (paragraph) dài 3-5 câu.

CẤU TRÚC JSON:
{
  "title": "Tiêu đề báo cáo",
  "subtitle": "Tiêu đề phụ",
  "author": "Tên tác giả",
  "organization": "Tổ chức",
  "date": "Ngày viết",
  "abstract": "Tóm tắt nội dung 100-200 từ",
  "sections": [
    {
      "heading": "Tên phần",
      "level": 1,
      "paragraphs": ["Đoạn văn 1...", "Đoạn văn 2..."],
      "bullets": ["Điểm 1", "Điểm 2"] // optional
    }
  ],
  "conclusion": "Kết luận tổng thể",
  "references": ["Nguồn tham khảo 1", "Nguồn 2"]
}

Quy tắc:
- Level 1: chương chính, Level 2: mục con, Level 3: tiểu mục.
- Nội dung phải mạch lạc, academic, có dẫn chứng.
- Kết luận phải tóm tắt lại toàn bài và nêu hướng phát triển.`;

function configuredApiKeys(input: GenerateReportInput) {
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

function cleanText(v: unknown, fallback = "", max = 5000) {
  return String(v ?? fallback).trim().slice(0, max);
}

const REPORT_TYPE_MAP: Record<string, string> = {
  academic: "báo cáo học thuật / luận văn",
  technical: "báo cáo kỹ thuật / technical report",
  business: "báo cáo kinh doanh / business report",
  general: "báo cáo tổng hợp",
};

function buildPrompt(input: GenerateReportInput) {
  const typeLabel = REPORT_TYPE_MAP[input.reportType] || "báo cáo tổng hợp";
  const contextLine = input.additionalContext
    ? `\nBối cảnh bổ sung: ${input.additionalContext.slice(0, 3000)}`
    : "";

  return `${REPORT_SYSTEM_PROMPT}

THÔNG TIN:
- Chủ đề: ${input.topic}
- Loại: ${typeLabel}
- Số trang ước tính: ${input.pageCount}
- Ngôn ngữ: ${input.language}
- Tác giả: ${input.authorName || "Không cung cấp"}
- Tổ chức: ${input.organization || "Không cung cấp"}${contextLine}

YÊU CẦU:
- Tạo nội dung đủ cho khoảng ${input.pageCount} trang A4.
- Mỗi trang cần khoảng 3-4 đoạn văn.
- Có ${Math.max(3, Math.ceil(input.pageCount / 1.5))} section chính.
- Chỉ trả JSON, không markdown code fence.`;
}

function normalizeReport(raw: Partial<AiReport>, input: GenerateReportInput): AiReport {
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()}`;

  return {
    title: cleanText(raw.title, input.topic, 200),
    subtitle: cleanText(raw.subtitle, "", 200),
    author: cleanText(raw.author, input.authorName || "AI DocHub", 120),
    organization: cleanText(raw.organization, input.organization || "", 200),
    date: cleanText(raw.date, dateStr, 30),
    abstract: cleanText(raw.abstract, "Báo cáo tổng hợp về " + input.topic, 2000),
    sections: Array.isArray(raw.sections)
      ? raw.sections.map((s) => ({
          heading: cleanText(s.heading, "Nội dung", 200),
          level: ([1, 2, 3].includes(s.level) ? s.level : 1) as 1 | 2 | 3,
          paragraphs: Array.isArray(s.paragraphs)
            ? s.paragraphs.map((p) => cleanText(p)).filter(Boolean)
            : ["Nội dung đang được phát triển."],
          bullets: Array.isArray(s.bullets)
            ? s.bullets.map((b) => cleanText(b, "", 300)).filter(Boolean)
            : undefined,
          tableData: s.tableData && Array.isArray(s.tableData.headers)
            ? {
                headers: s.tableData.headers.map((h) => cleanText(h, "", 100)),
                rows: Array.isArray(s.tableData.rows)
                  ? s.tableData.rows.map((r) => (Array.isArray(r) ? r.map((c) => cleanText(c, "", 200)) : []))
                  : [],
              }
            : undefined,
        }))
      : [
          {
            heading: "Giới thiệu",
            level: 1 as const,
            paragraphs: ["Báo cáo về " + input.topic + "."],
          },
        ],
    conclusion: cleanText(raw.conclusion, "Kết luận sẽ được bổ sung.", 3000),
    references: Array.isArray(raw.references)
      ? raw.references.map((r) => cleanText(r, "", 300)).filter(Boolean).slice(0, 15)
      : [],
  };
}

async function generateWithKey(input: GenerateReportInput, apiKey: string, modelName: string): Promise<AiReport> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0.5, responseMimeType: "application/json" },
  });

  const result = await model.generateContent(buildPrompt(input));
  const parsed = JSON.parse(extractJson(result.response.text())) as Partial<AiReport>;
  return normalizeReport(parsed, input);
}

export async function generateReportOutline(input: GenerateReportInput): Promise<AiReport> {
  const apiKeys = configuredApiKeys(input);
  if (apiKeys.length === 0) {
    throw new ConfigurationError("Thiếu Gemini API key. Hãy thêm key trong cài đặt hoặc .env.local.");
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
  throw new GenerationError(`Không thể tạo báo cáo. Lỗi cuối: ${failures.at(-1) || "N/A"}`);
}
