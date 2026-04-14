import pptxgen from "pptxgenjs";
import { AiDeck, AiSlide, GeneratePresentationInput } from "@/lib/schemas";
import { PptxTheme, inferTextColor, selectTheme } from "./theme";
import { generateImages, getImageApiKey } from "@/lib/generate-image";

const W = 10;
const H = 5.625;
const M = 0.58;
const CW = W - M * 2;
const CH = H - M * 2;
const TITLE_FONT = "Georgia";
const BODY_FONT = "Calibri";
const BADGE_X = 9.3;
const BADGE_Y = 5.1;
const BADGE_D = 0.4;

const LIGHT_TEXT = "f1f5f9";
const BRIGHT_TITLE = "f8fafc";
const LIGHT_BODY = "cbd5e1";
const DARK_TEXT = "0f172a";
const DARK_BODY = "1e293b";

type ImageMap = Map<number, string>;

type SlidePalette = {
  bgBase: string;
  bgTop: string;
  bgBottom: string;
  title: string;
  body: string;
  muted: string;
  caption: string;
  panel: string;
  panelSoft: string;
  panelLine: string;
  accent: string;
  secondary: string;
  light: string;
  isDark: boolean;
  titleShadow: string;
};

type TextOpts = {
  size?: number;
  color?: string;
  bold?: boolean;
  fontFace?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  margin?: number;
  glow?: boolean;
  shadowColor?: string;
};

function norm(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function fitTitleSize(text: string) {
  const len = norm(text).length;
  if (len > 95) return 24;
  if (len > 70) return 28;
  if (len > 48) return 32;
  return 38;
}

function fitBodySize(items: string[]) {
  const max = Math.max(0, ...items.map((item) => norm(item).length));
  if (max > 110) return 11;
  if (max > 82) return 12;
  if (max > 60) return 13;
  return 15;
}

function cleanHex(value: unknown, fallback = "1e293b") {
  const raw = String(value ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  return fallback;
}

function hex(theme: PptxTheme, key: keyof PptxTheme) {
  return cleanHex(theme[key], "1e293b");
}

function clamp(n: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(value: string) {
  const c = cleanHex(value);
  return {
    r: Number.parseInt(c.slice(0, 2), 16),
    g: Number.parseInt(c.slice(2, 4), 16),
    b: Number.parseInt(c.slice(4, 6), 16),
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

function buildPalette(theme: PptxTheme, bgKey: keyof PptxTheme = "bg", emphasis = false): SlidePalette {
  const bgBase = hex(theme, bgKey);
  const accent = hex(theme, "accent");
  const secondary = hex(theme, "secondary");
  const light = hex(theme, "light");
  const primary = hex(theme, "primary");

  const isDark = inferTextColor(bgBase) === LIGHT_TEXT;
  const title = isDark ? BRIGHT_TITLE : DARK_TEXT;
  const body = isDark ? LIGHT_BODY : DARK_BODY;
  const muted = isDark ? mix(LIGHT_BODY, secondary, 0.42) : mix(DARK_BODY, secondary, 0.52);
  const caption = isDark ? mix(accent, LIGHT_TEXT, 0.34) : mix(accent, DARK_TEXT, 0.16);
  const panel = isDark ? mix(bgBase, "ffffff", 0.16) : mix(bgBase, "0f172a", 0.04);
  const panelSoft = isDark ? mix(bgBase, "ffffff", 0.24) : mix(bgBase, "ffffff", 0.72);
  const panelLine = isDark ? mix(bgBase, "cbd5e1", 0.56) : mix(bgBase, "334155", 0.3);
  const bgTop = isDark ? mix(bgBase, primary, emphasis ? 0.55 : 0.44) : mix(bgBase, light, emphasis ? 0.52 : 0.42);
  const bgBottom = isDark ? mix(bgBase, accent, emphasis ? 0.4 : 0.3) : mix(bgBase, accent, emphasis ? 0.18 : 0.12);

  return {
    bgBase,
    bgTop,
    bgBottom,
    title,
    body,
    muted,
    caption,
    panel,
    panelSoft,
    panelLine,
    accent,
    secondary,
    light,
    isDark,
    titleShadow: isDark ? "020617" : "ffffff",
  };
}

function backgroundSvg(palette: SlidePalette, idx: number) {
  const o1x = 18 + ((idx * 11) % 46);
  const o1y = 20 + ((idx * 7) % 30);
  const o2x = 82 - ((idx * 9) % 38);
  const o2y = 78 - ((idx * 5) % 28);
  const c1 = mix(palette.accent, palette.light, palette.isDark ? 0.16 : 0.28);
  const c2 = mix(palette.secondary, palette.light, palette.isDark ? 0.08 : 0.2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs>
  <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#${palette.bgTop}" />
    <stop offset="100%" stop-color="#${palette.bgBottom}" />
  </linearGradient>
  <radialGradient id="orb1" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#${c1}" stop-opacity="${palette.isDark ? "0.36" : "0.28"}" />
    <stop offset="100%" stop-color="#${c1}" stop-opacity="0" />
  </radialGradient>
  <radialGradient id="orb2" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#${c2}" stop-opacity="${palette.isDark ? "0.28" : "0.22"}" />
    <stop offset="100%" stop-color="#${c2}" stop-opacity="0" />
  </radialGradient>
</defs>
<rect width="1600" height="900" fill="url(#bg)" />
<circle cx="${(o1x / 100) * 1600}" cy="${(o1y / 100) * 900}" r="430" fill="url(#orb1)" />
<circle cx="${(o2x / 100) * 1600}" cy="${(o2y / 100) * 900}" r="360" fill="url(#orb2)" />
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function createSlide(
  pres: pptxgen,
  theme: PptxTheme,
  index: number,
  options?: { bgKey?: keyof PptxTheme; emphasis?: boolean },
) {
  const palette = buildPalette(theme, options?.bgKey || "bg", Boolean(options?.emphasis));
  const slide = pres.addSlide();
  slide.background = { color: palette.bgBase };
  slide.addImage({ data: backgroundSvg(palette, index), x: 0, y: 0, w: W, h: H });
  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: H,
    fill: { color: palette.isDark ? "ffffff" : "ffffff", transparency: palette.isDark ? 97 : 98 },
    line: { color: palette.bgBase, transparency: 100 },
  });
  return { slide, palette };
}

function text(
  slide: pptxgen.Slide,
  value: unknown,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: TextOpts = {},
) {
  const clean = norm(value);
  if (!clean) return;
  slide.addText(clean, {
    x,
    y,
    w,
    h,
    margin: opts.margin ?? 0.05,
    fit: "shrink",
    fontFace: opts.fontFace || BODY_FONT,
    fontSize: opts.size || 14,
    color: cleanHex(opts.color, DARK_TEXT),
    bold: opts.bold ?? false,
    align: opts.align || "left",
    valign: opts.valign || "top",
    paraSpaceAfter: 2,
    breakLine: false,
    shadow: opts.glow
      ? {
          type: "outer",
          color: cleanHex(opts.shadowColor, "000000"),
          blur: 4,
          offset: 1,
          angle: 45,
          opacity: 0.25,
        }
      : undefined,
  });
}

function addBadge(slide: pptxgen.Slide, pres: pptxgen, palette: SlidePalette, num: number) {
  slide.addShape(pres.ShapeType.ellipse, {
    x: BADGE_X,
    y: BADGE_Y,
    w: BADGE_D,
    h: BADGE_D,
    fill: { color: palette.accent },
    line: { color: palette.accent, transparency: 100 },
  });
  text(slide, String(num).padStart(2, "0"), BADGE_X, BADGE_Y + 0.02, BADGE_D, BADGE_D - 0.02, {
    size: 10,
    color: "ffffff",
    bold: true,
    align: "center",
    valign: "middle",
    margin: 0,
  });
}

function addPanel(
  slide: pptxgen.Slide,
  pres: pptxgen,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  line: string,
  transparency = 0,
) {
  slide.addShape(pres.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.06,
    fill: { color: cleanHex(fill, "1e293b"), transparency },
    line: { color: cleanHex(line, "334155"), transparency: 45, width: 0.8 },
  });
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fallbackSvg(slide: AiSlide, palette: SlidePalette, idx: number) {
  const title = escapeSvg(norm(slide.imageKeyword || slide.title, "presentation visual").slice(0, 70));
  const label = escapeSvg(norm(slide.imageDescription || slide.title, "Professional visual").slice(0, 120));
  const offset = (idx % 4) * 90;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<rect width="1600" height="900" fill="#${palette.bgBase}"/>
<rect x="96" y="90" width="1408" height="720" rx="44" fill="#${palette.panelSoft}" opacity="0.22"/>
<circle cx="${360 + offset}" cy="260" r="210" fill="#${palette.secondary}" opacity="0.28"/>
<circle cx="${1160 - offset / 2}" cy="620" r="260" fill="#${palette.accent}" opacity="0.22"/>
<path d="M250 630 C430 440, 590 770, 780 550 S1160 420, 1320 210" stroke="#${palette.light}" stroke-width="18" fill="none" opacity="0.45"/>
<rect x="190" y="185" width="520" height="44" rx="22" fill="#${palette.panel}" opacity="0.62"/>
<rect x="190" y="270" width="780" height="28" rx="14" fill="#${palette.panel}" opacity="0.34"/>
<rect x="190" y="330" width="650" height="28" rx="14" fill="#${palette.panel}" opacity="0.26"/>
<text x="190" y="720" fill="#${palette.title}" font-family="Arial" font-size="42" font-weight="700">${title}</text>
<text x="190" y="775" fill="#${palette.body}" font-family="Arial" font-size="25">${label}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

async function prefetchImages(slides: AiSlide[], apiKey: string) {
  const items = slides
    .map((slide, index) => ({ index: index + 1, slide }))
    .filter(({ slide }) => slide.type !== "cover" && slide.type !== "summary")
    .map(({ index, slide }) => ({
      index,
      description: norm(slide.imageDescription || slide.imageKeyword || slide.title, "professional presentation visual"),
    }));

  return generateImages(items, apiKey);
}

function image(
  slide: pptxgen.Slide,
  item: AiSlide,
  palette: SlidePalette,
  idx: number,
  images: ImageMap,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  slide.addImage({
    data: images.get(idx) || fallbackSvg(item, palette, idx),
    x,
    y,
    w,
    h,
    altText: item.imageDescription || item.title,
  });
}

function bulletRows(
  slide: pptxgen.Slide,
  pres: pptxgen,
  items: string[] | null,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: SlidePalette,
  opts?: { max?: number; textColor?: string },
) {
  const bullets = (items || []).map((item) => norm(item)).filter(Boolean).slice(0, opts?.max || 5);
  if (!bullets.length) return;

  const fontSize = fitBodySize(bullets);
  const gap = Math.min(0.1, h / bullets.length / 5);
  const rowH = Math.max(0.38, (h - gap * (bullets.length - 1)) / bullets.length);
  const bulletTextColor = cleanHex(opts?.textColor, palette.body);

  bullets.forEach((item, i) => {
    const rowY = y + i * (rowH + gap);
    slide.addShape(pres.ShapeType.ellipse, {
      x,
      y: rowY + 0.08,
      w: 0.13,
      h: 0.13,
      fill: { color: i % 2 === 0 ? palette.accent : palette.secondary },
      line: { color: i % 2 === 0 ? palette.accent : palette.secondary, transparency: 100 },
    });
    text(slide, item, x + 0.26, rowY, w - 0.26, rowH, {
      size: fontSize,
      color: bulletTextColor,
    });
  });
}

function addNotes(slide: pptxgen.Slide, item: AiSlide) {
  if (item.speakerNotes) slide.addNotes(item.speakerNotes);
}

function buildCover(pres: pptxgen, deck: AiDeck, input: GeneratePresentationInput, theme: PptxTheme) {
  const { slide, palette } = createSlide(pres, theme, 1, { bgKey: "primary", emphasis: true });

  addPanel(slide, pres, M, M, 4.72, CH, palette.panelSoft, palette.panelLine, palette.isDark ? 18 : 8);
  text(slide, deck.title, M + 0.34, M + 0.36, 4.02, 1.55, {
    size: fitTitleSize(deck.title) + 4,
    color: palette.title,
    bold: true,
    fontFace: TITLE_FONT,
    glow: true,
    shadowColor: palette.titleShadow,
  });
  text(slide, deck.subtitle || input.command, M + 0.34, M + 2.13, 4.02, 0.78, {
    size: 17,
    color: palette.muted,
    bold: true,
  });
  text(slide, input.groupName || "GoogleSlideAI", M + 0.34, M + 3.2, 4.02, 0.32, {
    size: 13,
    color: palette.body,
    bold: true,
  });
  text(
    slide,
    input.members || `${deck.slideCount} slide | Tao boi Gemini va PptxGenJS`,
    M + 0.34,
    M + 3.62,
    4.02,
    0.58,
    { size: 11.5, color: palette.caption },
  );

  slide.addShape(pres.ShapeType.ellipse, {
    x: 6.08,
    y: 0.58,
    w: 2.96,
    h: 2.96,
    fill: { color: palette.secondary, transparency: 70 },
    line: { color: palette.secondary, transparency: 100 },
  });
  slide.addShape(pres.ShapeType.ellipse, {
    x: 7.32,
    y: 2.32,
    w: 2.12,
    h: 2.12,
    fill: { color: palette.accent, transparency: 60 },
    line: { color: palette.accent, transparency: 100 },
  });
  slide.addShape(pres.ShapeType.roundRect, {
    x: 5.78,
    y: 4.07,
    w: 3.64,
    h: 0.86,
    rectRadius: 0.08,
    fill: { color: palette.panel, transparency: 35 },
    line: { color: palette.panelLine, transparency: 70 },
  });
  text(slide, "GoogleSlideAI", 6.0, 4.27, 3.2, 0.34, {
    size: 14,
    color: palette.title,
    bold: true,
    align: "center",
    glow: true,
    shadowColor: palette.titleShadow,
  });
  addNotes(slide, deck.slides[0]);
}

function buildToc(pres: pptxgen, item: AiSlide, idx: number, theme: PptxTheme, images: ImageMap) {
  const { slide, palette } = createSlide(pres, theme, idx, { bgKey: item.bgKey || "bg" });
  const items = (item.bullets?.length
    ? item.bullets
    : ["Boi canh", "Noi dung chinh", "Ung dung", "Ket luan"]
  ).slice(0, 6);

  text(slide, "AGENDA", M, M, 1.5, 0.26, { size: 9, color: palette.caption, bold: true });
  text(slide, item.title || "Muc luc", M, M + 0.33, 5.05, 0.64, {
    size: 34,
    color: palette.title,
    bold: true,
    fontFace: TITLE_FONT,
    glow: true,
    shadowColor: palette.titleShadow,
  });

  const startY = 1.36;
  const rowH = Math.min(0.56, 3.48 / Math.max(items.length, 1));
  items.forEach((entry, i) => {
    const y = startY + i * (rowH + 0.04);
    addPanel(
      slide,
      pres,
      M,
      y,
      5.18,
      rowH,
      i % 2 === 0 ? palette.panelSoft : palette.panel,
      palette.panelLine,
      i % 2 === 0 ? 12 : 18,
    );
    text(slide, String(i + 1).padStart(2, "0"), M + 0.16, y + 0.1, 0.55, rowH - 0.14, {
      size: 14,
      color: palette.accent,
      bold: true,
      valign: "middle",
    });
    text(slide, entry, M + 0.78, y + 0.1, 4.1, rowH - 0.14, {
      size: 14,
      color: palette.body,
      bold: true,
      valign: "middle",
    });
  });

  image(slide, item, palette, idx, images, 6.05, 1.04, 3.4, 3.68);
  slide.addShape(pres.ShapeType.rect, {
    x: 6.05,
    y: 1.04,
    w: 3.4,
    h: 3.68,
    fill: { color: palette.bgBase, transparency: 88 },
    line: { color: palette.bgBase, transparency: 100 },
  });
  addBadge(slide, pres, palette, idx);
  addNotes(slide, item);
}

function buildSection(pres: pptxgen, item: AiSlide, idx: number, theme: PptxTheme, images: ImageMap) {
  const { slide, palette } = createSlide(pres, theme, idx, { bgKey: item.bgKey || "primary", emphasis: true });

  image(slide, item, palette, idx, images, 0, 0, W, H);
  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: H,
    fill: { color: palette.bgBase, transparency: palette.isDark ? 78 : 84 },
    line: { color: palette.bgBase, transparency: 100 },
  });

  text(slide, String(idx).padStart(2, "0"), 0.75, 0.82, 2.0, 1.15, {
    size: 82,
    color: mix(palette.title, palette.accent, 0.15),
    bold: true,
    fontFace: TITLE_FONT,
    glow: true,
    shadowColor: palette.titleShadow,
  });
  addPanel(slide, pres, 0.78, 2.18, 5.9, 2.24, palette.panel, palette.panelLine, 24);
  text(slide, item.title, 1.08, 2.46, 5.28, 0.82, {
    size: fitTitleSize(item.title),
    color: palette.title,
    bold: true,
    fontFace: TITLE_FONT,
    glow: true,
    shadowColor: palette.titleShadow,
  });
  text(
    slide,
    item.subtitle || item.bullets?.[0] || "Chuyen sang phan noi dung ke tiep",
    1.08,
    3.42,
    5.28,
    0.44,
    {
      size: 14,
      color: palette.body,
    },
  );
  addBadge(slide, pres, palette, idx);
  addNotes(slide, item);
}

function buildContent(pres: pptxgen, item: AiSlide, idx: number, theme: PptxTheme, images: ImageMap) {
  const variant = idx % 8;
  const darkVariant = variant === 3;
  const bgKey = item.bgKey || (darkVariant ? "primary" : "bg");
  const { slide, palette } = createSlide(pres, theme, idx, { bgKey, emphasis: darkVariant });

  const bullets = item.bullets?.length
    ? item.bullets
    : [
        "Noi dung chinh duoc trinh bay ngan gon.",
        "Co vi du va lap luan ro.",
        "Ket noi voi muc tieu thuyet trinh.",
      ];

  if (variant === 0) {
    text(slide, item.subtitle || "Noi dung", M, M, 4.35, 0.28, { size: 9, color: palette.caption, bold: true });
    text(slide, item.title, M, M + 0.34, 4.35, 0.82, {
      size: fitTitleSize(item.title),
      color: palette.title,
      bold: true,
      fontFace: TITLE_FONT,
      glow: true,
      shadowColor: palette.titleShadow,
    });
    bulletRows(slide, pres, bullets, M, 1.56, 4.2, 3.28, palette, { textColor: palette.body });
    image(slide, item, palette, idx, images, 5.25, 0.76, 4.23, 4.25);
  } else if (variant === 1) {
    image(slide, item, palette, idx, images, M, 0.78, 4.15, 4.22);
    text(slide, item.subtitle || "Goc nhin", 5.18, M, 4.32, 0.28, { size: 9, color: palette.caption, bold: true });
    text(slide, item.title, 5.18, M + 0.34, 4.32, 0.9, {
      size: fitTitleSize(item.title),
      color: palette.title,
      bold: true,
      fontFace: TITLE_FONT,
      glow: true,
      shadowColor: palette.titleShadow,
    });
    bulletRows(slide, pres, bullets, 5.18, 1.66, 4.18, 3.13, palette, { textColor: palette.body });
  } else if (variant === 2) {
    text(slide, item.subtitle || "Phan tich", M, M, CW, 0.28, { size: 9, color: palette.caption, bold: true });
    text(slide, item.title, M, M + 0.34, CW, 0.78, {
      size: fitTitleSize(item.title),
      color: palette.title,
      bold: true,
      fontFace: TITLE_FONT,
      glow: true,
      shadowColor: palette.titleShadow,
    });
    const cellW = (CW - 0.36) / 2;
    const cellH = 1.42;
    bullets.slice(0, 4).forEach((entry, i) => {
      const x = M + (i % 2) * (cellW + 0.36);
      const y = 1.5 + Math.floor(i / 2) * 1.66;
      addPanel(
        slide,
        pres,
        x,
        y,
        cellW,
        cellH,
        i % 2 === 0 ? palette.panelSoft : palette.panel,
        palette.panelLine,
        i % 2 === 0 ? 10 : 18,
      );
      text(slide, `0${i + 1}`, x + 0.18, y + 0.16, 0.46, 0.28, {
        size: 17,
        color: palette.accent,
        bold: true,
      });
      text(slide, entry, x + 0.18, y + 0.56, cellW - 0.36, 0.66, {
        size: 13,
        color: palette.body,
      });
    });
  } else if (variant === 3) {
    image(slide, item, palette, idx, images, 0, 0, W, H);
    slide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: W,
      h: H,
      fill: { color: palette.bgBase, transparency: palette.isDark ? 80 : 86 },
      line: { color: palette.bgBase, transparency: 100 },
    });
    addPanel(slide, pres, M, M, 4.92, CH, palette.panel, palette.panelLine, 25);
    text(slide, item.subtitle || "Trong tam", M + 0.28, M + 0.28, 4.34, 0.28, {
      size: 9,
      color: palette.caption,
      bold: true,
    });
    text(slide, item.title, M + 0.28, M + 0.68, 4.34, 0.92, {
      size: fitTitleSize(item.title),
      color: palette.title,
      bold: true,
      fontFace: TITLE_FONT,
      glow: true,
      shadowColor: palette.titleShadow,
    });
    bulletRows(slide, pres, bullets, M + 0.28, 1.94, 4.24, 2.8, palette, {
      textColor: palette.body,
    });
  } else if (variant === 4) {
    text(slide, item.subtitle || "Quy trinh", M, M, CW, 0.28, { size: 9, color: palette.caption, bold: true });
    text(slide, item.title, M, M + 0.34, CW, 0.72, {
      size: fitTitleSize(item.title),
      color: palette.title,
      bold: true,
      fontFace: TITLE_FONT,
      glow: true,
      shadowColor: palette.titleShadow,
    });
    const steps = bullets.slice(0, 4);
    const stepW = (CW - (steps.length - 1) * 0.24) / Math.max(steps.length, 1);
    steps.forEach((entry, i) => {
      const x = M + i * (stepW + 0.24);
      addPanel(
        slide,
        pres,
        x,
        1.45,
        stepW,
        1.7,
        i % 2 === 0 ? palette.panelSoft : palette.panel,
        palette.panelLine,
        i % 2 === 0 ? 12 : 18,
      );
      text(slide, `0${i + 1}`, x + 0.14, 1.6, stepW - 0.28, 0.28, {
        size: 16,
        color: palette.accent,
        bold: true,
      });
      text(slide, entry, x + 0.14, 2.0, stepW - 0.28, 0.84, { size: 11.5, color: palette.body });
    });
    image(slide, item, palette, idx, images, M, 3.48, CW, 1.42);
  } else if (variant === 5) {
    text(slide, item.subtitle || "Diem nhan", M, M, CW, 0.28, { size: 9, color: palette.caption, bold: true });
    text(slide, item.title, M, M + 0.34, CW, 0.72, {
      size: fitTitleSize(item.title),
      color: palette.title,
      bold: true,
      fontFace: TITLE_FONT,
      glow: true,
      shadowColor: palette.titleShadow,
    });
    addPanel(slide, pres, M, 1.42, 3.72, 2.38, palette.panelSoft, palette.panelLine, 10);
    text(slide, bullets[0], M + 0.25, 1.7, 3.22, 0.78, {
      size: 22,
      color: palette.title,
      bold: true,
      fontFace: TITLE_FONT,
      glow: true,
      shadowColor: palette.titleShadow,
    });
    text(slide, bullets[1] || "", M + 0.25, 2.7, 3.22, 0.58, { size: 12.5, color: palette.muted });
    image(slide, item, palette, idx, images, 4.58, 1.42, 4.9, 1.52);
    bulletRows(slide, pres, bullets.slice(2), 4.58, 3.25, 4.72, 1.5, palette, { max: 4, textColor: palette.body });
  } else if (variant === 6) {
    image(slide, item, palette, idx, images, 0, 0, W, H);
    slide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: W,
      h: H,
      fill: { color: palette.bgBase, transparency: palette.isDark ? 82 : 88 },
      line: { color: palette.bgBase, transparency: 100 },
    });
    text(slide, item.subtitle || "Center focus", 1.1, 0.72, 7.8, 0.34, {
      size: 10,
      color: palette.caption,
      bold: true,
      align: "center",
    });
    text(slide, item.title, 1.0, 1.16, 8.0, 0.92, {
      size: fitTitleSize(item.title),
      color: palette.title,
      bold: true,
      fontFace: TITLE_FONT,
      align: "center",
      glow: true,
      shadowColor: palette.titleShadow,
    });
    addPanel(slide, pres, 1.1, 2.22, 7.8, 2.46, palette.panel, palette.panelLine, 22);
    bulletRows(slide, pres, bullets, 1.5, 2.6, 7.0, 1.9, palette, { max: 5, textColor: palette.body });
  } else {
    text(slide, item.subtitle || "Asymmetric", M, M, CW, 0.28, { size: 9, color: palette.caption, bold: true });
    text(slide, item.title, M, M + 0.34, CW, 0.72, {
      size: fitTitleSize(item.title),
      color: palette.title,
      bold: true,
      fontFace: TITLE_FONT,
      glow: true,
      shadowColor: palette.titleShadow,
    });
    image(slide, item, palette, idx, images, M, 1.38, 5.0, 3.66);
    addPanel(slide, pres, 5.26, 1.38, 4.16, 3.66, palette.panelSoft, palette.panelLine, 20);
    bulletRows(slide, pres, bullets, 5.56, 1.74, 3.56, 2.94, palette, { max: 6, textColor: palette.body });
  }

  addBadge(slide, pres, palette, idx);
  addNotes(slide, item);
}

function buildSummary(
  pres: pptxgen,
  deck: AiDeck,
  item: AiSlide,
  idx: number,
  theme: PptxTheme,
  input: GeneratePresentationInput,
) {
  const { slide, palette } = createSlide(pres, theme, idx, { bgKey: item.bgKey || "bg", emphasis: true });

  text(slide, item.title || "Tong ket", M, M, 5.45, 0.82, {
    size: 38,
    color: palette.title,
    bold: true,
    fontFace: TITLE_FONT,
    glow: true,
    shadowColor: palette.titleShadow,
  });
  text(slide, item.subtitle || "Nhung diem can nho", M, 1.24, 5.35, 0.36, {
    size: 13,
    color: palette.caption,
    bold: true,
  });
  bulletRows(slide, pres, item.bullets, M, 1.84, 5.3, 2.45, palette, { max: 5, textColor: palette.body });

  addPanel(slide, pres, 6.28, M, 3.2, CH, mix(palette.panel, palette.bgBase, 0.6), palette.panelLine, 4);
  text(slide, "Q&A", 6.52, 0.98, 2.72, 0.88, {
    size: 46,
    color: palette.title,
    bold: true,
    fontFace: TITLE_FONT,
    align: "center",
    glow: true,
    shadowColor: palette.titleShadow,
  });
  text(slide, input.groupName || "GoogleSlideAI", 6.54, 1.94, 2.68, 0.36, {
    size: 13,
    color: palette.body,
    bold: true,
    align: "center",
  });

  if (deck.references.length) {
    text(slide, "Tham khao", 6.55, 2.74, 2.62, 0.25, { size: 12, color: palette.title, bold: true });
    deck.references.slice(0, 4).forEach((ref, i) => {
      text(slide, ref, 6.55, 3.12 + i * 0.38, 2.62, 0.28, { size: 9, color: palette.body });
    });
  }

  addBadge(slide, pres, palette, idx);
  addNotes(slide, item);
}

function safeFilename(value: string) {
  const ascii = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${ascii || "presentation"}-${Date.now()}.pptx`;
}

export function getThemeForDeck(deck: AiDeck) {
  return selectTheme(deck.themeHint || "", deck.theme, deck.themeMode);
}

export async function renderDeckToBuffer(deck: AiDeck, input: GeneratePresentationInput, apiKeys?: string[]) {
  const { name: themeName, mode, theme } = selectTheme(deck.themeHint || "", deck.theme, deck.themeMode);
  const slides = deck.slides.slice(0, input.slideCount);
  const imageApiKey = getImageApiKey(apiKeys);
  const images = await prefetchImages(slides, imageApiKey);

  const pres = new pptxgen();
  pres.defineLayout({ name: "LAYOUT_16X9", width: W, height: H });
  pres.layout = "LAYOUT_16X9";
  pres.author = "GoogleSlideAI";
  pres.company = input.groupName || "GoogleSlideAI";
  pres.subject = input.command;
  pres.title = deck.title;
  pres.theme = { headFontFace: TITLE_FONT, bodyFontFace: BODY_FONT };

  const total = slides.length;
  slides.forEach((slide, i) => {
    const num = i + 1;
    if (i === 0 || slide.type === "cover") return buildCover(pres, deck, input, theme);
    if (num === total || slide.type === "summary") return buildSummary(pres, deck, slide, num, theme, input);
    if (slide.type === "toc") return buildToc(pres, slide, num, theme, images);
    if (slide.type === "section") return buildSection(pres, slide, num, theme, images);
    return buildContent(pres, slide, num, theme, images);
  });

  const output = await pres.write({ outputType: "nodebuffer" });
  return {
    buffer: Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer),
    fileName: safeFilename(deck.title),
    themeName,
    mode,
    theme,
  };
}
