import { z } from "zod";

/* ─── Presentations ──────────────────────────────────────────────── */

export const generatePresentationSchema = z.object({
  command: z.string().trim().min(8, "Hãy nhập yêu cầu rõ hơn."),
  slideCount: z.coerce.number().int().min(3).max(30),
  language: z.string().trim().default("Tiếng Việt"),
  groupName: z.string().trim().max(120).optional().default(""),
  members: z.string().trim().max(600).optional().default(""),
  apiKeys: z
    .array(z.string().trim().max(256))
    .max(3)
    .optional()
    .default([])
    .transform((keys) => keys.filter((key) => key.length >= 20).slice(0, 3)),
});

export type GeneratePresentationInput = z.infer<typeof generatePresentationSchema>;

export type SlideKind = "cover" | "toc" | "section" | "content" | "summary";

export type SlideBgKey = "primary" | "secondary" | "accent" | "bg" | "light";

export type ThemeMode = "dark" | "deep-dark" | "modern-dark" | "light" | "mixed";

export type DeckTheme = {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  light: string;
};

export type AiSlide = {
  type: SlideKind;
  title: string;
  subtitle: string;
  bullets: string[] | null;
  imageDescription: string;
  imageKeyword: string;
  imageQuery: string;
  speakerNotes: string;
  bgKey?: SlideBgKey;
};

export type AiDeck = {
  title: string;
  subtitle: string;
  slideCount: number;
  themeMode?: ThemeMode;
  audience?: string;
  themeHint?: string;
  slides: AiSlide[];
  theme: DeckTheme;
  references: string[];
};

export type ThemeInfo = DeckTheme & {
  name: string;
  mode?: ThemeMode;
};

export type PreviewResponse = {
  title: string;
  subtitle: string;
  slideCount: number;
  slides: AiSlide[];
  references: string[];
  pptxBase64: string;
  fileName: string;
  theme: ThemeInfo;
};

export type EditDeckRequest = {
  deck: AiDeck;
  command: string;
  /** Client-provided key, stored in localStorage as `gemini_api_key`. */
  apiKey?: string;
};

export type EditDeckResponse = PreviewResponse & {
  editedSlideNumber: number;
};

/* ─── Word Report ────────────────────────────────────────────────── */

export type ReportType = "academic" | "technical" | "business" | "general";

export const generateReportSchema = z.object({
  topic: z.string().trim().min(8, "Hãy nhập chủ đề rõ hơn."),
  reportType: z.enum(["academic", "technical", "business", "general"]).default("general"),
  pageCount: z.coerce.number().int().min(1).max(50).default(5),
  language: z.string().trim().default("Tiếng Việt"),
  authorName: z.string().trim().max(120).optional().default(""),
  organization: z.string().trim().max(200).optional().default(""),
  additionalContext: z.string().trim().max(5000).optional().default(""),
  apiKeys: z
    .array(z.string().trim().max(256))
    .max(3)
    .optional()
    .default([])
    .transform((keys) => keys.filter((key) => key.length >= 20).slice(0, 3)),
});

export type GenerateReportInput = z.infer<typeof generateReportSchema>;

export type ReportSection = {
  heading: string;
  level: 1 | 2 | 3;
  paragraphs: string[];
  bullets?: string[];
  tableData?: { headers: string[]; rows: string[][] };
};

export type AiReport = {
  title: string;
  subtitle: string;
  author: string;
  organization: string;
  date: string;
  abstract: string;
  sections: ReportSection[];
  conclusion: string;
  references: string[];
};

export type ReportPreviewResponse = {
  title: string;
  report: AiReport;
  docxBase64: string;
  fileName: string;
};

/* ─── Excel ──────────────────────────────────────────────────────── */

export const generateExcelSchema = z.object({
  description: z.string().trim().min(8, "Hãy nhập mô tả dữ liệu rõ hơn."),
  sheetCount: z.coerce.number().int().min(1).max(10).default(1),
  language: z.string().trim().default("Tiếng Việt"),
  uploadedData: z.string().trim().max(50000).optional().default(""),
  apiKeys: z
    .array(z.string().trim().max(256))
    .max(3)
    .optional()
    .default([])
    .transform((keys) => keys.filter((key) => key.length >= 20).slice(0, 3)),
});

export type GenerateExcelInput = z.infer<typeof generateExcelSchema>;

export type ExcelSheet = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
  columnWidths?: number[];
  summary?: string;
};

export type AiExcelData = {
  title: string;
  sheets: ExcelSheet[];
  analysis?: string;
};

export type ExcelPreviewResponse = {
  title: string;
  data: AiExcelData;
  xlsxBase64: string;
  fileName: string;
};

/* ─── Code Analysis ──────────────────────────────────────────────── */

export const analyzeCodeSchema = z.object({
  code: z.string().trim().min(10, "Hãy nhập mã nguồn để phân tích."),
  language: z.string().trim().max(60).optional().default("auto"),
  analysisType: z.enum(["review", "refactor", "document", "security", "full"]).default("full"),
  apiKeys: z
    .array(z.string().trim().max(256))
    .max(3)
    .optional()
    .default([])
    .transform((keys) => keys.filter((key) => key.length >= 20).slice(0, 3)),
});

export type AnalyzeCodeInput = z.infer<typeof analyzeCodeSchema>;

export type CodeIssue = {
  severity: "error" | "warning" | "info" | "suggestion";
  line?: number;
  message: string;
  suggestion?: string;
};

export type AiCodeAnalysis = {
  language: string;
  summary: string;
  issues: CodeIssue[];
  refactoredCode?: string;
  documentation?: string;
  securityNotes?: string[];
  qualityScore: number;
};

export type CodeAnalysisResponse = {
  analysis: AiCodeAnalysis;
};
