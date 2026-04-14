import { DeckTheme, ThemeMode } from "@/lib/schemas";

export type PptxTheme = DeckTheme;

const DARK_TEXT = "0f172a";
const LIGHT_TEXT = "f1f5f9";
const HIGH_LIGHT_TEXT = "f8fafc";
const BANNED_BG = new Set(["000000", "0a0f1c"]);

type ThemePreset = { mode: ThemeMode; theme: PptxTheme };

export const defaultTheme: PptxTheme = {
  primary: "1e2937",
  secondary: "64748b",
  accent: "3b82f6",
  bg: "e2e8f0",
  light: "f8fafc",
};

const presets: Record<string, ThemePreset> = {
  modernDark: {
    mode: "modern-dark",
    theme: { primary: "1e2937", secondary: "475569", accent: "60a5fa", bg: "1a2333", light: "f8fafc" },
  },
  dark: {
    mode: "dark",
    theme: { primary: "243244", secondary: "5b6b82", accent: "60a5fa", bg: "1e2937", light: "f1f5f9" },
  },
  deepDark: {
    mode: "deep-dark",
    theme: { primary: "1b2638", secondary: "51607a", accent: "818cf8", bg: "1a2333", light: "f8fafc" },
  },
  light: {
    mode: "light",
    theme: { primary: "0f172a", secondary: "64748b", accent: "2563eb", bg: "f8fafc", light: "ffffff" },
  },
  mixed: {
    mode: "mixed",
    theme: { primary: "0f172a", secondary: "334155", accent: "3b82f6", bg: "e2e8f0", light: "f8fafc" },
  },
};

function cleanHex(value: unknown) {
  const raw = String(value ?? "").trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : "";
}

function clamp(n: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string) {
  const value = cleanHex(hex);
  if (!value) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return [r, g, b]
    .map((v) => clamp(Math.round(v)).toString(16).padStart(2, "0"))
    .join("");
}

function mix(hexA: string, hexB: string, weight = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(weight, 1));
  return rgbToHex(
    a.r * (1 - w) + b.r * w,
    a.g * (1 - w) + b.g * w,
    a.b * (1 - w) + b.b * w,
  );
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const [rr, gg, bb] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function enforceReadableTheme(theme: PptxTheme): PptxTheme {
  const out = {
    primary: cleanHex(theme.primary) || defaultTheme.primary,
    secondary: cleanHex(theme.secondary) || defaultTheme.secondary,
    accent: cleanHex(theme.accent) || defaultTheme.accent,
    bg: cleanHex(theme.bg) || defaultTheme.bg,
    light: cleanHex(theme.light) || defaultTheme.light,
  };

  if (BANNED_BG.has(out.bg)) out.bg = "1e2937";
  if (BANNED_BG.has(out.primary)) out.primary = "243244";

  if (relativeLuminance(out.bg) < 0.06) out.bg = mix(out.bg, "1e2937", 0.52);
  if (relativeLuminance(out.primary) < 0.08) out.primary = mix(out.primary, "243244", 0.48);

  const contrastHint = Math.abs(relativeLuminance(out.bg) - relativeLuminance(out.light));
  if (contrastHint < 0.56) out.light = HIGH_LIGHT_TEXT;

  const secondaryLum = relativeLuminance(out.secondary);
  const bgLum = relativeLuminance(out.bg);
  if (Math.abs(secondaryLum - bgLum) < 0.17) {
    out.secondary = bgLum < 0.4 ? mix(out.secondary, "94a3b8", 0.45) : mix(out.secondary, DARK_TEXT, 0.3);
  }

  const accentLum = relativeLuminance(out.accent);
  if (bgLum < 0.35 && accentLum < 0.26) out.accent = mix(out.accent, "93c5fd", 0.58);

  return out;
}

function modeFromHint(hint: string): ThemeMode {
  const h = hint.toLowerCase();
  if (/deep[-\s]?dark|very dark|ultra dark/.test(h)) return "deep-dark";
  if (/modern[-\s]?dark|cinematic|futuristic|premium dark/.test(h)) return "modern-dark";
  if (/light|bright|minimal light|clean white/.test(h)) return "light";
  if (/mixed|hybrid|balanced/.test(h)) return "mixed";
  return "dark";
}

function pickPreset(hint: string): { name: string; preset: ThemePreset } {
  const mode = modeFromHint(hint);
  if (mode === "light") return { name: "light", preset: presets.light };
  if (mode === "mixed") return { name: "mixed", preset: presets.mixed };
  if (mode === "deep-dark") return { name: "deepDark", preset: presets.deepDark };
  if (mode === "modern-dark") return { name: "modernDark", preset: presets.modernDark };
  return { name: "dark", preset: presets.dark };
}

export function normalizeTheme(value: unknown): PptxTheme | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<Record<keyof PptxTheme, unknown>>;
  const theme = {
    primary: cleanHex(source.primary),
    secondary: cleanHex(source.secondary),
    accent: cleanHex(source.accent),
    bg: cleanHex(source.bg),
    light: cleanHex(source.light),
  };
  if (!Object.values(theme).every(Boolean)) return null;
  return enforceReadableTheme(theme);
}

export function inferTextColor(bgHex: string) {
  const bg = cleanHex(bgHex) || "1e293b";
  return relativeLuminance(bg) < 0.38 ? LIGHT_TEXT : DARK_TEXT;
}

export function selectTheme(
  hint: string,
  generated?: unknown,
  modePreference?: ThemeMode,
): { name: string; mode: ThemeMode; theme: PptxTheme } {
  const parsed = normalizeTheme(generated);
  if (parsed) {
    const mode = modePreference || modeFromHint(hint);
    return { name: "gemini", mode, theme: parsed };
  }

  const preset = pickPreset(`${hint} ${modePreference || ""}`);
  return {
    name: preset.name,
    mode: preset.preset.mode,
    theme: enforceReadableTheme(preset.preset.theme),
  };
}
