import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiCodeAnalysis, AnalyzeCodeInput, CodeIssue } from "@/lib/schemas";
import { ConfigurationError, GenerationError } from "@/lib/errors";

const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash"];

const CODE_SYSTEM_PROMPT = `Bạn là chuyên gia phân tích mã nguồn và code review. Hãy phân tích code một cách chuyên nghiệp.

Yêu cầu:
- Trả về DUY NHẤT một object JSON hợp lệ, không markdown.
- Phân tích chi tiết, chính xác, và hữu ích.

CẤU TRÚC JSON:
{
  "language": "Ngôn ngữ lập trình (tự phát hiện)",
  "summary": "Tóm tắt chức năng code 100-200 từ",
  "issues": [
    {
      "severity": "error" | "warning" | "info" | "suggestion",
      "line": số dòng (nếu xác định được),
      "message": "Mô tả vấn đề",
      "suggestion": "Gợi ý sửa"
    }
  ],
  "refactoredCode": "Code đã refactor (nếu có thể cải thiện)",
  "documentation": "Tài liệu mô tả code (JSDoc/docstring format)",
  "securityNotes": ["Ghi chú bảo mật 1", "Ghi chú 2"],
  "qualityScore": 0-100
}

Quy tắc:
- severity: error = bug/crash, warning = bad practice, info = thông tin, suggestion = gợi ý cải tiến
- qualityScore: 0-100 (80+ tốt, 60-79 trung bình, <60 cần cải thiện)
- refactoredCode chỉ trả code thuần, không markdown fence
- documentation phải đầy đủ: mô tả, params, returns, ví dụ
- Phân tích cả performance, readability, maintainability, security`;

function configuredApiKeys(input: AnalyzeCodeInput) {
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

function cleanText(v: unknown, fallback = "", max = 10000) {
  return String(v ?? fallback).trim().slice(0, max);
}

const ANALYSIS_TYPE_MAP: Record<string, string> = {
  review: "Code review: tìm bug, bad practice, coding style",
  refactor: "Refactor: cải thiện cấu trúc, readability, performance",
  document: "Tạo tài liệu: JSDoc, README, API documentation",
  security: "Phân tích bảo mật: SQL injection, XSS, auth issues",
  full: "Phân tích toàn diện: review + refactor + document + security",
};

function buildPrompt(input: AnalyzeCodeInput) {
  const analysisLabel = ANALYSIS_TYPE_MAP[input.analysisType] || ANALYSIS_TYPE_MAP.full;

  return `${CODE_SYSTEM_PROMPT}

LOẠI PHÂN TÍCH: ${analysisLabel}
NGÔN NGỮ: ${input.language === "auto" ? "Tự phát hiện" : input.language}

MÃ NGUỒN CẦN PHÂN TÍCH:
${input.code.slice(0, 15000)}

Chỉ trả JSON, không markdown code fence.`;
}

function normalizeIssue(raw: Partial<CodeIssue>): CodeIssue {
  const validSeverities = new Set(["error", "warning", "info", "suggestion"]);
  return {
    severity: (validSeverities.has(raw.severity || "") ? raw.severity : "info") as CodeIssue["severity"],
    line: typeof raw.line === "number" && raw.line > 0 ? raw.line : undefined,
    message: cleanText(raw.message, "Không có chi tiết", 500),
    suggestion: raw.suggestion ? cleanText(raw.suggestion, "", 1000) : undefined,
  };
}

function normalizeAnalysis(raw: Partial<AiCodeAnalysis>): AiCodeAnalysis {
  return {
    language: cleanText(raw.language, "Unknown", 60),
    summary: cleanText(raw.summary, "Không có tóm tắt.", 2000),
    issues: Array.isArray(raw.issues) ? raw.issues.map(normalizeIssue).slice(0, 50) : [],
    refactoredCode: raw.refactoredCode ? cleanText(raw.refactoredCode, "", 30000) : undefined,
    documentation: raw.documentation ? cleanText(raw.documentation, "", 10000) : undefined,
    securityNotes: Array.isArray(raw.securityNotes)
      ? raw.securityNotes.map((n) => cleanText(n, "", 500)).filter(Boolean).slice(0, 10)
      : undefined,
    qualityScore: typeof raw.qualityScore === "number" ? Math.max(0, Math.min(100, Math.round(raw.qualityScore))) : 50,
  };
}

async function analyzeWithKey(input: AnalyzeCodeInput, apiKey: string, modelName: string): Promise<AiCodeAnalysis> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
  });

  const result = await model.generateContent(buildPrompt(input));
  const parsed = JSON.parse(extractJson(result.response.text())) as Partial<AiCodeAnalysis>;
  return normalizeAnalysis(parsed);
}

export async function analyzeCode(input: AnalyzeCodeInput): Promise<AiCodeAnalysis> {
  const apiKeys = configuredApiKeys(input);
  if (apiKeys.length === 0) {
    throw new ConfigurationError("Thiếu Gemini API key.");
  }

  const models = configuredModels();
  const failures: string[] = [];
  for (const key of apiKeys) {
    for (const model of models) {
      try {
        return await analyzeWithKey(input, key, model);
      } catch (err) {
        if (err instanceof ConfigurationError) throw err;
        failures.push(`${model}: ${safeError(err)}`);
      }
    }
  }
  throw new GenerationError(`Không thể phân tích code. Lỗi cuối: ${failures.at(-1) || "N/A"}`);
}
