import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  AiDeck,
  AiSlide,
  GeneratePresentationInput,
  SlideBgKey,
  SlideKind,
  ThemeMode,
} from "./schemas";
import { ConfigurationError, GenerationError } from "./errors";
import { defaultTheme, normalizeTheme } from "./pptx/theme";

const allowedTypes = new Set<SlideKind>(["cover", "toc", "section", "content", "summary"]);
const allowedBgKeys = new Set<SlideBgKey>(["primary", "secondary", "accent", "bg", "light"]);
const allowedThemeModes = new Set<ThemeMode>(["dark", "deep-dark", "modern-dark", "light", "mixed"]);
const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash"];

export const SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế bài thuyết trình PowerPoint cao cấp, phong cách học thuật - hiện đại - tối giản sang trọng.

Yêu cầu quan trọng:
- Luôn trả về DUY NHẤT một object JSON hợp lệ, không có bất kỳ chữ nào ngoài JSON.
- Sử dụng đúng 5 kiểu slide: cover, toc, section, content, summary.
- Tạo đúng số slide người dùng yêu cầu.
- Theme linh hoạt theo chủ đề: dark, deep-dark, modern-dark, light hoặc mixed.

CẤU TRÚC JSON PHẢI CHÍNH XÁC:
{
  "title": "Tiêu đề chính của bài thuyết trình",
  "subtitle": "Tiêu đề phụ hoặc câu mô tả ngắn gọn",
  "slideCount": số slide đúng yêu cầu,
  "themeMode": "dark" | "deep-dark" | "modern-dark" | "light" | "mixed",
  "slides": [
    {
      "type": "cover" | "toc" | "section" | "content" | "summary",
      "title": "Tiêu đề slide",
      "subtitle": "Tiêu đề phụ (nếu có)",
      "bullets": ["điểm ngắn gọn 1", "điểm ngắn gọn 2", ...] hoặc null,
      "imageDescription": "Mô tả hình ảnh chi tiết, đẹp, phù hợp chủ đề và nền slide",
      "imageKeyword": "từ khóa ngắn để tìm ảnh",
      "imageQuery": "từ khóa chi tiết hơn cho Unsplash",
      "speakerNotes": "Ghi chú thuyết trình tự nhiên, rõ ràng, 45-70 giây mỗi slide",
      "bgKey": "primary" | "secondary" | "accent" | "bg" | "light"
    }
  ],
  "theme": {
    "primary": "#hexcolor",
    "secondary": "#hexcolor",
    "accent": "#hexcolor",
    "bg": "#hexcolor",
    "light": "#hexcolor"
  },
  "references": ["Nguồn 1", "Nguồn 2", ...]
}

Quy tắc thiết kế:
- Cover: text bên trái, hình học lớn bên phải.
- Tránh nền đen thuần (#000000, #0a0f1c).
- Ưu tiên độ tương phản cao, title/body dễ đọc.
- Content slide có tối đa 5-6 bullet points ngắn.
- imageDescription cần cụ thể và có tính minh họa cao.
- Giữ chất lượng thẩm mỹ cao và nhất quán toàn deck.`;

export default SYSTEM_PROMPT;

function configuredApiKeys(input: GeneratePresentationInput) {
  const envKeys = [process.env.GEMINI_API_KEY || "", process.env.GEMINI_API_KEYS || ""]
    .flatMap((value) => value.split(/[\n,;]/))
    .map((key) => key.trim())
    .filter(Boolean);
  const requestKeys = input.apiKeys.map((key) => key.trim()).filter(Boolean);
  return Array.from(new Set([...requestKeys, ...envKeys]));
}

function configuredModels() {
  const envModels = [process.env.GEMINI_MODEL || "", process.env.GEMINI_FALLBACK_MODELS || ""]
    .flatMap((value) => value.split(/[\n,;]/))
    .map((model) => model.trim())
    .filter(Boolean);
  return Array.from(new Set([...envModels, ...fallbackModels]));
}

function safeGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Gemini API bi loi.";
  return message.replace(/AIza[0-9A-Za-z_-]+/g, "[API_KEY]");
}

function parseRetryAfterSeconds(message: string): number | null {
  const m1 = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s?/i);
  if (m1?.[1]) return Math.max(1, Math.ceil(Number(m1[1])));
  const m2 = message.match(/"retryDelay"\s*:\s*"([0-9]+)s"/i);
  if (m2?.[1]) return Math.max(1, Number(m2[1]));
  return null;
}

function isQuotaZero(message: string) {
  return /limit:\s*0/i.test(message) || /quota exceeded/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: unknown, fallback = "", max = 240) {
  const text = String(value ?? fallback).replace(/\s+/g, " ").trim();
  return text.slice(0, max).trim();
}

function normalizeBullets(value: unknown, type: SlideKind): string[] | null {
  if (type === "cover" || type === "section") {
    if (!Array.isArray(value)) return null;
  }
  const items = Array.isArray(value)
    ? value.map((item) => normalizeText(item, "", 120)).filter(Boolean)
    : [];
  if (items.length === 0) return type === "cover" || type === "section" ? null : ["Y chinh can trinh bay ngan gon."];
  return items.slice(0, 6);
}

function normalizeKeyword(value: unknown, fallback: string) {
  const cleaned = normalizeText(value, fallback, 120)
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ").filter(Boolean).slice(0, 8).join(" ") || "professional presentation visual";
}

function normalizeBgKey(value: unknown): SlideBgKey | undefined {
  const key = String(value || "").trim() as SlideBgKey;
  return allowedBgKeys.has(key) ? key : undefined;
}

function normalizeThemeMode(value: unknown, hint: string): ThemeMode {
  const mode = String(value || "").trim() as ThemeMode;
  if (allowedThemeModes.has(mode)) return mode;
  const h = hint.toLowerCase();
  if (/deep[-\s]?dark|very dark|ultra dark/.test(h)) return "deep-dark";
  if (/modern[-\s]?dark|cinematic|futuristic|premium/.test(h)) return "modern-dark";
  if (/light|bright|minimal light|clean/.test(h)) return "light";
  if (/mixed|hybrid|balanced/.test(h)) return "mixed";
  return "dark";
}

function targetType(index: number, total: number, incoming?: SlideKind): SlideKind {
  if (index === 0) return "cover";
  if (index === total - 1) return "summary";
  if (index === 1 && total > 3) return "toc";
  if (total >= 5 && index === Math.max(2, Math.floor(total / 2)) && incoming !== "toc") return "section";
  return incoming && allowedTypes.has(incoming) ? incoming : "content";
}

function fallbackSlide(input: GeneratePresentationInput, index: number, total: number): AiSlide {
  const type = targetType(index, total);
  const n = index + 1;
  const topic = normalizeText(input.command, "Chu de bai thuyet trinh", 120);
  if (type === "cover") {
    return {
      type,
      title: topic,
      subtitle: input.groupName || "Bai thuyet trinh duoc tao boi GoogleSlideAI",
      bullets: null,
      imageDescription: `Khong gian trinh chieu hien dai ve ${topic}, anh sang dep, bo cuc sang trong.`,
      imageKeyword: "modern presentation stage",
      imageQuery: "modern academic presentation stage cinematic lighting",
      speakerNotes: "Gioi thieu chu de, muc tieu va boi canh cua bai thuyet trinh.",
      bgKey: "primary",
    };
  }
  if (type === "toc") {
    return {
      type,
      title: "Muc luc",
      subtitle: "Cac phan chinh",
      bullets: ["Boi canh", "Luan diem chinh", "Ung dung", "Ket luan"],
      imageDescription: "Ban lam viec hien dai voi cau truc ke hoach trinh bay ro rang.",
      imageKeyword: "presentation planning desk",
      imageQuery: "modern planning desk presentation outline cinematic lighting",
      speakerNotes: "Dan dat nguoi nghe qua cau truc chinh cua bai.",
      bgKey: "bg",
    };
  }
  if (type === "section") {
    return {
      type,
      title: `Phan ${n - 1}: Trong tam noi dung`,
      subtitle: "Chuyen sang luan diem tiep theo",
      bullets: null,
      imageDescription: `Hinh anh chuyen doan hien dai lien quan den ${topic}, bo cuc toi gian.`,
      imageKeyword: "abstract professional transition",
      imageQuery: "abstract professional presentation transition cinematic lighting",
      speakerNotes: "Tao nhip nghi va chuyen sang phan noi dung moi.",
      bgKey: "secondary",
    };
  }
  if (type === "summary") {
    return {
      type,
      title: "Tong ket",
      subtitle: "Thong diep chinh",
      bullets: ["Tom tat luan diem cot loi.", "Nhan manh gia tri thuc tien.", "Mo phan hoi dap."],
      imageDescription: "Khan phong thuyet trinh hien dai trong khoanh khac ket luan va hoi dap.",
      imageKeyword: "conference audience Q&A",
      imageQuery: "modern conference audience Q&A cinematic lighting",
      speakerNotes: "Tom tat bai, nhan manh ket luan va moi cau hoi.",
      bgKey: "primary",
    };
  }
  return {
    type,
    title: `Luan diem ${n - 2}`,
    subtitle: "Noi dung chinh",
    bullets: ["Neu y chinh mot cach truc tiep.", "Giai thich bang vi du ngan.", "Lien he voi chu de tong the."],
    imageDescription: `Hinh anh minh hoa dep cho ${topic}, co chieu sau va de doc tren nen toi.`,
    imageKeyword: "professional visual concept",
    imageQuery: "professional concept visual academic presentation cinematic lighting",
    speakerNotes: "Trien khai luan diem bang lap luan ngan gon, co vi du va ket noi voi phan tiep theo.",
    bgKey: "bg",
  };
}

function normalizeSlide(raw: Partial<AiSlide> | undefined, input: GeneratePresentationInput, index: number, total: number): AiSlide {
  const fallback = fallbackSlide(input, index, total);
  const incomingType = raw?.type && allowedTypes.has(raw.type) ? raw.type : fallback.type;
  const type = targetType(index, total, incomingType);
  const title = normalizeText(raw?.title, fallback.title, 110) || fallback.title;
  const subtitle = normalizeText(raw?.subtitle, fallback.subtitle, 160);
  const imageQuery = normalizeKeyword(raw?.imageQuery, fallback.imageQuery);
  return {
    type,
    title,
    subtitle,
    bullets: normalizeBullets(raw?.bullets, type) ?? fallback.bullets,
    imageDescription: normalizeText(raw?.imageDescription, fallback.imageDescription, 260) || fallback.imageDescription,
    imageKeyword: normalizeKeyword(raw?.imageKeyword, imageQuery || fallback.imageKeyword),
    imageQuery,
    speakerNotes: normalizeText(raw?.speakerNotes, fallback.speakerNotes, 900) || fallback.speakerNotes,
    bgKey: normalizeBgKey(raw?.bgKey) || fallback.bgKey,
  };
}

function normalizeDeck(raw: Partial<AiDeck>, input: GeneratePresentationInput): AiDeck {
  const total = input.slideCount;
  const rawSlides = Array.isArray(raw.slides) ? raw.slides : [];
  const slides = Array.from({ length: total }, (_, index) => normalizeSlide(rawSlides[index], input, index, total));
  const theme = normalizeTheme(raw.theme);
  const title = normalizeText(raw.title, slides[0]?.title || input.command, 120);
  const subtitle = normalizeText(raw.subtitle, slides[0]?.subtitle || "", 180);
  const themeMode = normalizeThemeMode(raw.themeMode, `${raw.themeHint || ""} ${input.command}`);

  slides[0] = { ...slides[0], type: "cover", title, subtitle: subtitle || slides[0].subtitle };
  if (total > 3) slides[1] = { ...slides[1], type: "toc", title: slides[1].title || "Muc luc" };
  slides[total - 1] = { ...slides[total - 1], type: "summary" };

  return {
    title,
    subtitle,
    slideCount: total,
    themeMode,
    audience: normalizeText(raw.audience, "Nguoi nghe tieng Viet", 120),
    themeHint: normalizeText(raw.themeHint, "modern, readable, elegant", 120),
    slides,
    theme: theme || defaultTheme,
    references: Array.isArray(raw.references)
      ? raw.references.map((ref) => normalizeText(ref, "", 180)).filter(Boolean).slice(0, 8)
      : [],
  };
}

function buildPrompt(input: GeneratePresentationInput) {
  const groupLine = input.members
    ? `Ten nhom: ${input.groupName || "khong cung cap"}. Thanh vien: ${input.members}.`
    : `Ten nhom: ${input.groupName || "khong cung cap"}.`;

  return `${SYSTEM_PROMPT}

THONG TIN BAT BUOC:
- Chu de nguoi dung: ${input.command}
- So slide phai tao: ${input.slideCount}
- Ngon ngu noi dung: ${input.language}
- Thong tin nhom: ${groupLine}

RANG BUOC BO SUNG:
- Mang "slides" bat buoc dung ${input.slideCount} phan tu.
- Neu >= 4 slide thi slide 2 la "toc".
- Neu >= 5 slide thi co it nhat 1 slide "section".
- Slide cuoi la "summary".
- Bullet 3-6 y ngan gon, toi da 18 tu/1 bullet.
- imageKeyword va imageQuery dung tieng Anh, ngan gon, ro nghia.
- imageQuery uu tien them "cinematic lighting, professional photography, high detail".
- Theme mau khong duoc dung nen den thuan (#000000, #0a0f1c).
- Background uu tien gradient de doc, khong tao cam giac den nang.
- themeMode uu tien "light" hoac "mixed" neu chu de khong bat buoc nen toi.
- Neu nen toi thi text title nen o muc #f8fafc/#e2e8f0, body o muc #cbd5e1.
- Chi tra JSON hop le, khong markdown code fence.`;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new GenerationError("Gemini khong tra ve JSON hop le.");
  return match[0];
}

async function generateWithKey(input: GeneratePresentationInput, apiKey: string, modelName: string): Promise<AiDeck> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.55,
      responseMimeType: "application/json",
    },
  });

  try {
    const result = await model.generateContent(buildPrompt(input));
    const parsed = JSON.parse(extractJson(result.response.text())) as Partial<AiDeck>;
    return normalizeDeck(parsed, input);
  } catch (err) {
    const msg = safeGeminiError(err);
    if (/\b429\b/.test(msg)) {
      const retrySec = parseRetryAfterSeconds(msg);
      if (retrySec && retrySec <= 60) {
        await sleep(retrySec * 1000);
        const result2 = await model.generateContent(buildPrompt(input));
        const parsed2 = JSON.parse(extractJson(result2.response.text())) as Partial<AiDeck>;
        return normalizeDeck(parsed2, input);
      }
      if (isQuotaZero(msg)) {
        throw new GenerationError(
          "Gemini API bi het quota hoac chua bat billing cho API key nay. Hay kiem tra plan/billing trong Google AI Studio, hoac dung API key khac.",
        );
      }
      throw new GenerationError(`Gemini dang bi gioi han tan suat. Hay thu lai sau${retrySec ? ` ${retrySec}s` : ""}.`);
    }
    throw err;
  }
}

export async function generateDeckOutline(input: GeneratePresentationInput): Promise<AiDeck> {
  const apiKeys = configuredApiKeys(input);
  if (apiKeys.length === 0) {
    throw new ConfigurationError("Thieu Gemini API key. Hay them key trong cai dat hoac .env.local.");
  }

  const models = configuredModels();
  const failures: string[] = [];
  for (const key of apiKeys) {
    for (const model of models) {
      try {
        return await generateWithKey(input, key, model);
      } catch (err) {
        if (err instanceof ConfigurationError) throw err;
        failures.push(`${model}: ${safeGeminiError(err)}`);
      }
    }
  }
  throw new GenerationError(`Gemini loi voi tat ca API key/model. Loi cuoi: ${failures.at(-1) || "N/A"}`);
}
