import { GoogleGenerativeAI } from "@google/generative-ai";
import { AiDeck, AiSlide, SlideBgKey } from "@/lib/schemas";
import { ConfigurationError, GenerationError } from "@/lib/errors";

type EditPlan = {
  slideNumber: number;
  set?: {
    title?: string;
    subtitle?: string;
    speakerNotes?: string;
    imageKeyword?: string;
    imageQuery?: string;
    imageDescription?: string;
    bgKey?: SlideBgKey;
  };
  replaceBullets?: string[] | null;
  addBullets?: string[];
  shortenBullets?: boolean;
};

const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash"];
const bgKeys = new Set<SlideBgKey>(["primary", "secondary", "accent", "bg", "light"]);

function configuredModels() {
  const envModels = [process.env.GEMINI_MODEL || "", process.env.GEMINI_FALLBACK_MODELS || ""]
    .flatMap((value) => value.split(/[\n,;]/))
    .map((model) => model.trim())
    .filter(Boolean);
  return Array.from(new Set([...envModels, ...fallbackModels]));
}

function configuredApiKeys(provided?: string[]) {
  const providedKeys = (provided || []).map((key) => key.trim()).filter(Boolean);
  const envKeys = [process.env.GEMINI_API_KEY || "", process.env.GEMINI_API_KEYS || ""]
    .flatMap((value) => value.split(/[\n,;]/))
    .map((key) => key.trim())
    .filter(Boolean);
  return Array.from(new Set([...providedKeys, ...envKeys]));
}

function safeGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Gemini API bị lỗi.";
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

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new GenerationError("Gemini không trả về JSON hợp lệ.");
  return match[0];
}

function cleanText(value: unknown, max = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

function cleanKeyword(value: unknown) {
  const text = cleanText(value, 120)
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.split(" ").filter(Boolean).slice(0, 8).join(" ");
}

function cleanBullets(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, limit);
}

function inferBgKey(command: string): SlideBgKey | undefined {
  const text = command.toLowerCase();
  if (/(đen|black|dark)/.test(text)) return "primary";
  if (/(trắng|white|sáng|light)/.test(text)) return "bg";
  if (/(xanh|blue|green|teal)/.test(text)) return "secondary";
  if (/(đỏ|red|vàng|yellow|orange|cam)/.test(text)) return "accent";
  return undefined;
}

function buildEditPrompt(deck: AiDeck, command: string) {
  const slides = deck.slides.map((slide, index) => ({
    slideNumber: index + 1,
    type: slide.type,
    title: slide.title,
    subtitle: slide.subtitle,
    bullets: slide.bullets || [],
    imageKeyword: slide.imageKeyword,
    bgKey: slide.bgKey,
  }));

  return `
Bạn là trợ lý chỉnh sửa PowerPoint. Hãy chuyển lệnh tiếng Việt của người dùng thành một kế hoạch chỉnh sửa tối thiểu.

QUY TẮC:
- Chỉ sửa đúng nội dung người dùng yêu cầu.
- Nếu người dùng không nói rõ slide số mấy, trả slideNumber = -1.
- Không đổi type của slide.
- bgKey chỉ được là: primary, secondary, accent, bg, light.
- Trả về JSON hợp lệ, không markdown.

LỆNH NGƯỜI DÙNG:
${command}

DECK:
${JSON.stringify({ title: deck.title, slideCount: deck.slideCount, slides })}

JSON schema:
{
  "slideNumber": number,
  "set": {
    "title": "string",
    "subtitle": "string",
    "speakerNotes": "string",
    "imageKeyword": "english keywords",
    "imageQuery": "english search query",
    "imageDescription": "mô tả ảnh tiếng Việt",
    "bgKey": "primary|secondary|accent|bg|light"
  },
  "replaceBullets": ["string"] hoặc null,
  "addBullets": ["string"],
  "shortenBullets": boolean
}`.trim();
}

function normalizePlan(plan: Partial<EditPlan>, command: string): EditPlan {
  const rawBg = plan.set?.bgKey;
  const bgKey = rawBg && bgKeys.has(rawBg) ? rawBg : inferBgKey(command);

  return {
    slideNumber: Number(plan.slideNumber),
    set: {
      title: plan.set?.title ? cleanText(plan.set.title, 120) : undefined,
      subtitle: plan.set?.subtitle ? cleanText(plan.set.subtitle, 160) : undefined,
      speakerNotes: plan.set?.speakerNotes ? cleanText(plan.set.speakerNotes, 900) : undefined,
      imageKeyword: plan.set?.imageKeyword ? cleanKeyword(plan.set.imageKeyword) : undefined,
      imageQuery: plan.set?.imageQuery ? cleanKeyword(plan.set.imageQuery) : undefined,
      imageDescription: plan.set?.imageDescription ? cleanText(plan.set.imageDescription, 260) : undefined,
      bgKey,
    },
    replaceBullets: Array.isArray(plan.replaceBullets) ? cleanBullets(plan.replaceBullets, 6) : undefined,
    addBullets: cleanBullets(plan.addBullets, 3),
    shortenBullets: Boolean(plan.shortenBullets),
  };
}

async function generateEditPlan(deck: AiDeck, command: string, apiKey: string, modelName: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  });

  try {
    const result = await model.generateContent(buildEditPrompt(deck, command));
    return normalizePlan(JSON.parse(extractJson(result.response.text())) as Partial<EditPlan>, command);
  } catch (error) {
    const msg = safeGeminiError(error);
    if (/\b429\b/.test(msg)) {
      const retrySec = parseRetryAfterSeconds(msg);
      if (retrySec && retrySec <= 60) {
        await sleep(retrySec * 1000);
        const result = await model.generateContent(buildEditPrompt(deck, command));
        return normalizePlan(JSON.parse(extractJson(result.response.text())) as Partial<EditPlan>, command);
      }
      if (isQuotaZero(msg)) {
        throw new GenerationError(
          "Gemini API bị hết quota hoặc chưa bật billing cho API key này. Hãy kiểm tra plan/billing trong Google AI Studio, hoặc dùng API key khác.",
        );
      }
      throw new GenerationError(`Gemini đang bị giới hạn tần suất. Hãy thử lại sau${retrySec ? ` ${retrySec}s` : ""}.`);
    }
    throw error;
  }
}

function applyEdit(deck: AiDeck, plan: EditPlan): { deck: AiDeck; editedSlideNumber: number } {
  if (!Number.isFinite(plan.slideNumber) || plan.slideNumber < 1 || plan.slideNumber > deck.slides.length) {
    throw new GenerationError("Không xác định được slide cần sửa. Hãy nêu rõ: 'slide số N'.");
  }

  const index = plan.slideNumber - 1;
  const before = deck.slides[index];
  const set = plan.set || {};
  const next: AiSlide = { ...before };

  if (set.title !== undefined) next.title = set.title;
  if (set.subtitle !== undefined) next.subtitle = set.subtitle;
  if (set.speakerNotes !== undefined) next.speakerNotes = set.speakerNotes;
  if (set.imageKeyword !== undefined) next.imageKeyword = set.imageKeyword;
  if (set.imageQuery !== undefined) next.imageQuery = set.imageQuery;
  if (set.imageDescription !== undefined) next.imageDescription = set.imageDescription;
  if (set.bgKey !== undefined) next.bgKey = set.bgKey;

  if (plan.replaceBullets && plan.replaceBullets.length > 0) {
    next.bullets = plan.replaceBullets;
  }

  if (plan.addBullets && plan.addBullets.length > 0) {
    const current = next.bullets || [];
    const seen = new Set(current.map((item) => item.toLowerCase()));
    const additions = plan.addBullets.filter((item) => !seen.has(item.toLowerCase()));
    next.bullets = [...current, ...additions].slice(0, 6);
  }

  if (plan.shortenBullets && next.bullets) {
    next.bullets = next.bullets.map((bullet) => (bullet.length <= 78 ? bullet : `${bullet.slice(0, 76).trimEnd()}...`));
  }

  const slides = deck.slides.slice();
  slides[index] = next;
  return { deck: { ...deck, slideCount: slides.length, slides }, editedSlideNumber: plan.slideNumber };
}

export async function editDeckByCommand(deck: AiDeck, command: string, opts?: { apiKey?: string }) {
  const apiKeys = configuredApiKeys(opts?.apiKey ? [opts.apiKey] : undefined);
  if (apiKeys.length === 0) {
    throw new ConfigurationError(
      "Thiếu Gemini API key. Hãy mở Cài đặt để lưu key, hoặc đặt GEMINI_API_KEY trong .env.local.",
    );
  }

  const failures: string[] = [];
  for (const apiKey of apiKeys) {
    for (const model of configuredModels()) {
      try {
        return applyEdit(deck, await generateEditPlan(deck, command, apiKey, model));
      } catch (error) {
        failures.push(`${model}: ${safeGeminiError(error)}`);
      }
    }
  }

  throw new GenerationError(`Không thể xử lý lệnh sửa slide. Lỗi cuối: ${failures.at(-1) || "N/A"}`);
}
