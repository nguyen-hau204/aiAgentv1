"use client";

import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { AiSlide, DeckTheme, ThemeInfo } from "@/lib/schemas";
import { inferTextColor } from "@/lib/pptx/theme";

type Props = {
  slide: AiSlide;
  index: number;
  total: number;
  theme: ThemeInfo;
  title?: string;
  subtitle?: string;
  groupName?: string;
  members?: string;
  references?: string[];
};

type PreviewPalette = {
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
};

function color(hex: string) {
  return `#${String(hex || "111827").replace(/^#/, "")}`;
}

function withAlpha(hex: string, opacity: number) {
  const normalized = color(hex).slice(1);
  const alpha = Math.round(Math.max(0, Math.min(opacity, 1)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${normalized}${alpha}`;
}

function mix(hexA: string, hexB: string, weight = 0.5) {
  const a = color(hexA).slice(1);
  const b = color(hexB).slice(1);
  const parts = [0, 2, 4].map((offset) => {
    const av = Number.parseInt(a.slice(offset, offset + 2), 16);
    const bv = Number.parseInt(b.slice(offset, offset + 2), 16);
    return Math.round(av * (1 - weight) + bv * weight)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${parts.join("")}`;
}

function themeColor(theme: DeckTheme, key: keyof DeckTheme) {
  return color(theme[key]);
}

function previewPalette(theme: DeckTheme, bgKey: keyof DeckTheme = "bg", emphasis = false): PreviewPalette {
  const bgBase = themeColor(theme, bgKey);
  const accent = themeColor(theme, "accent");
  const secondary = themeColor(theme, "secondary");
  const light = themeColor(theme, "light");
  const primary = themeColor(theme, "primary");
  const isDark = inferTextColor(bgBase.replace("#", "")) === "f1f5f9";

  return {
    bgBase,
    bgTop: isDark ? mix(bgBase, primary, emphasis ? 0.55 : 0.44) : mix(bgBase, light, emphasis ? 0.52 : 0.42),
    bgBottom: isDark ? mix(bgBase, accent, emphasis ? 0.4 : 0.3) : mix(bgBase, accent, emphasis ? 0.18 : 0.12),
    title: isDark ? "#f8fafc" : "#0f172a",
    body: isDark ? "#cbd5e1" : "#1e293b",
    muted: isDark ? mix("#cbd5e1", secondary, 0.42) : mix("#1e293b", secondary, 0.52),
    caption: isDark ? mix(accent, "#f8fafc", 0.34) : mix(accent, "#0f172a", 0.16),
    panel: isDark ? mix(bgBase, "#ffffff", 0.16) : mix(bgBase, "#0f172a", 0.04),
    panelSoft: isDark ? mix(bgBase, "#ffffff", 0.24) : mix(bgBase, "#ffffff", 0.72),
    panelLine: isDark ? mix(bgBase, "#cbd5e1", 0.56) : mix(bgBase, "#334155", 0.3),
    accent,
    secondary,
    light,
    isDark,
  };
}

function gradientStyle(palette: PreviewPalette, index: number): CSSProperties {
  const o1x = 18 + ((index * 11) % 46);
  const o1y = 20 + ((index * 7) % 30);
  const o2x = 82 - ((index * 9) % 38);
  const o2y = 78 - ((index * 5) % 28);
  const c1 = mix(palette.accent, palette.light, palette.isDark ? 0.16 : 0.28);
  const c2 = mix(palette.secondary, palette.light, palette.isDark ? 0.08 : 0.2);
  return {
    backgroundColor: palette.bgBase,
    backgroundImage: [
      `radial-gradient(circle at ${o1x}% ${o1y}%, ${withAlpha(c1, palette.isDark ? 0.36 : 0.28)} 0%, transparent 45%)`,
      `radial-gradient(circle at ${o2x}% ${o2y}%, ${withAlpha(c2, palette.isDark ? 0.28 : 0.22)} 0%, transparent 42%)`,
      `linear-gradient(135deg, ${palette.bgTop} 0%, ${palette.bgBottom} 100%)`,
    ].join(", "),
  };
}

function ClampText({
  children,
  lines = 2,
  style,
  className = "",
}: {
  children: ReactNode;
  lines?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
        overflow: "hidden",
        overflowWrap: "anywhere",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ palette, num }: { palette: PreviewPalette; num: number }) {
  return (
    <div
      className="absolute grid place-items-center rounded-full"
      style={{
        right: "2.4%",
        bottom: "3.4%",
        width: "4.5%",
        aspectRatio: "1",
        backgroundColor: palette.accent,
      }}
    >
      <span className="font-bold leading-none text-white" style={{ fontSize: "0.62em" }}>
        {String(num).padStart(2, "0")}
      </span>
    </div>
  );
}

// ─── In-memory image cache ─────────────────────────────────
const imageCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string | null>>();

function getApiKey(): string {
  try {
    return localStorage.getItem("googleslideai.gemini-key.v1") || "";
  } catch {
    return "";
  }
}

async function fetchAiImage(description: string): Promise<string | null> {
  const cacheKey = description.slice(0, 120);
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  // Deduplicate in-flight requests
  const existing = inflightRequests.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const apiKey = getApiKey();
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          apiKeys: apiKey ? [apiKey] : [],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.imageBase64) {
        imageCache.set(cacheKey, data.imageBase64);
        return data.imageBase64 as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}

function ImageBlock({
  slide,
  index,
  className = "",
  style,
  overlayColor = "rgba(0,0,0,0.16)",
}: {
  slide: AiSlide;
  index: number;
  className?: string;
  style?: CSSProperties;
  overlayColor?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const description = slide.imageDescription || slide.imageKeyword || slide.title;
  const cacheKey = description.slice(0, 120);

  useEffect(() => {
    mounted.current = true;
    // Check cache first (sync)
    const cached = imageCache.get(cacheKey);
    if (cached) {
      setSrc(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchAiImage(description).then((result) => {
      if (mounted.current) {
        setSrc(result);
        setLoading(false);
      }
    });

    return () => {
      mounted.current = false;
    };
  }, [description, cacheKey]);

  // Generate a gradient fallback SVG based on the slide description
  const fallbackGradient = (() => {
    const hash = description.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const hue1 = hash % 360;
    const hue2 = (hue1 + 45) % 360;
    const keyword = (slide.imageKeyword || slide.title || "").slice(0, 40);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="hsl(${hue1},45%,22%)" />
          <stop offset="100%" stop-color="hsl(${hue2},55%,16%)" />
        </linearGradient>
        <radialGradient id="o1" cx="30%" cy="35%" r="40%">
          <stop offset="0%" stop-color="hsl(${hue1},50%,35%)" stop-opacity="0.4" />
          <stop offset="100%" stop-color="transparent" />
        </radialGradient>
        <radialGradient id="o2" cx="75%" cy="70%" r="35%">
          <stop offset="0%" stop-color="hsl(${hue2},60%,30%)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="transparent" />
        </radialGradient>
      </defs>
      <rect width="800" height="450" fill="url(#g)" />
      <rect width="800" height="450" fill="url(#o1)" />
      <rect width="800" height="450" fill="url(#o2)" />
      <circle cx="${200 + (hash % 200)}" cy="${100 + (hash % 120)}" r="120" fill="hsl(${hue1},40%,28%)" opacity="0.3" />
      <circle cx="${500 + (hash % 150)}" cy="${280 + (hash % 80)}" r="90" fill="hsl(${hue2},50%,25%)" opacity="0.25" />
      <text x="400" y="420" fill="white" opacity="0.15" font-family="Arial" font-size="16" text-anchor="middle">${keyword.replace(/[<>&"']/g, "")}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  })();

  return (
    <div className={`relative overflow-hidden rounded-md ${className}`} style={style}>
      {loading ? (
        <div className="shimmer h-full w-full" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
      ) : (
        <img
          src={src || fallbackGradient}
          alt={slide.imageDescription || slide.title}
          className="h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0" style={{ backgroundColor: overlayColor }} />
    </div>
  );
}

function BulletList({
  bullets,
  palette,
  max = 5,
  textColor,
}: {
  bullets: string[] | null;
  palette: PreviewPalette;
  max?: number;
  textColor?: string;
}) {
  const items = (bullets || []).filter(Boolean).slice(0, max);
  return (
    <div className="flex h-full flex-col justify-start gap-[5%]">
      {items.map((item, idx) => (
        <div key={`${idx}-${item}`} className="grid grid-cols-[0.8em_1fr] items-start gap-[0.55em]">
          <span
            className="mt-[0.28em] block rounded-full"
            style={{
              width: "0.38em",
              height: "0.38em",
              backgroundColor: idx % 2 === 0 ? palette.accent : palette.secondary,
            }}
          />
          <ClampText
            lines={2}
            style={{
              color: textColor || palette.body,
              fontSize: "0.76em",
              lineHeight: 1.24,
            }}
          >
            {item}
          </ClampText>
        </div>
      ))}
    </div>
  );
}

function CoverPreview({ slide, theme, title, subtitle, groupName, members, total, index }: Props) {
  const palette = previewPalette(theme, "primary", true);
  return (
    <div className="absolute inset-0" style={gradientStyle(palette, index)}>
      <div
        className="absolute rounded-md"
        style={{
          left: "5.2%",
          top: "9%",
          width: "47%",
          height: "82%",
          backgroundColor: withAlpha(palette.panelSoft, palette.isDark ? 0.85 : 0.9),
          border: `1px solid ${withAlpha(palette.panelLine, 0.65)}`,
          padding: "5.2%",
        }}
      >
        <div className="flex h-full flex-col justify-center">
          <ClampText lines={4} className="font-bold leading-[1.04]" style={{ color: palette.title, fontSize: "1.72em" }}>
            {title || slide.title}
          </ClampText>
          <ClampText lines={3} className="mt-[6%] font-semibold leading-snug" style={{ color: palette.muted, fontSize: "0.72em" }}>
            {subtitle || slide.subtitle}
          </ClampText>
          <ClampText className="mt-[12%] font-bold" style={{ color: palette.body, fontSize: "0.58em" }}>
            {groupName || "GoogleSlideAI"}
          </ClampText>
          <ClampText lines={2} className="mt-[4%]" style={{ color: palette.caption, fontSize: "0.48em" }}>
            {members || `${total} slide | Gemini + PptxGenJS`}
          </ClampText>
        </div>
      </div>
      <div className="absolute rounded-full" style={{ right: "11%", top: "13%", width: "29%", aspectRatio: "1", backgroundColor: withAlpha(palette.secondary, 0.32) }} />
      <div className="absolute rounded-full" style={{ right: "6%", top: "43%", width: "21%", aspectRatio: "1", backgroundColor: withAlpha(palette.accent, 0.3) }} />
      <div className="absolute rounded-md" style={{ right: "6%", bottom: "12%", width: "36%", height: "13%", backgroundColor: withAlpha(palette.panel, 0.55) }} />
    </div>
  );
}

function TocPreview({ slide, theme, index }: Props) {
  const items = (slide.bullets?.length ? slide.bullets : ["Boi canh", "Noi dung chinh", "Ung dung", "Ket luan"]).slice(0, 6);
  const palette = previewPalette(theme, slide.bgKey || "bg");
  return (
    <div className="absolute inset-0 flex flex-col" style={{ ...gradientStyle(palette, index), padding: "5.2%" }}>
      <div className="font-bold uppercase tracking-[0.24em]" style={{ color: palette.caption, fontSize: "0.42em" }}>
        Agenda
      </div>
      <ClampText lines={2} className="mt-[1%] font-bold leading-tight" style={{ color: palette.title, fontSize: "1.22em" }}>
        {slide.title}
      </ClampText>
      <div className="mt-[4%] grid min-h-0 flex-1 grid-cols-[1.42fr_1fr] gap-[5%]">
        <div className="flex min-h-0 flex-col gap-[3%]">
          {items.map((item, i) => (
            <div
              key={`${i}-${item}`}
              className="grid min-h-0 grid-cols-[2.2em_1fr] items-center rounded-md px-[4%]"
              style={{
                backgroundColor: i % 2 === 0 ? withAlpha(palette.panelSoft, 0.88) : withAlpha(palette.panel, 0.84),
                border: `1px solid ${withAlpha(palette.panelLine, 0.75)}`,
              }}
            >
              <span className="font-bold" style={{ color: palette.accent, fontSize: "0.62em" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <ClampText lines={1} className="font-bold" style={{ color: palette.body, fontSize: "0.62em" }}>
                {item}
              </ClampText>
            </div>
          ))}
        </div>
        <ImageBlock slide={slide} index={index} overlayColor={withAlpha(palette.bgBase, 0.2)} />
      </div>
      <Badge palette={palette} num={index + 1} />
    </div>
  );
}

function SectionPreview({ slide, theme, index }: Props) {
  const palette = previewPalette(theme, slide.bgKey || "primary", true);
  return (
    <div className="absolute inset-0 overflow-hidden" style={gradientStyle(palette, index)}>
      <ImageBlock slide={slide} index={index} className="absolute inset-0 rounded-none opacity-35" overlayColor={withAlpha(palette.bgBase, 0.28)} />
      <div className="absolute inset-0" style={{ backgroundColor: withAlpha(palette.bgBase, 0.24) }} />
      <div className="absolute left-[8%] top-[16%] w-[74%]">
        <div className="font-bold leading-none" style={{ color: withAlpha(mix(palette.title, palette.accent, 0.15), 0.96), fontSize: "3.9em" }}>
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="mt-[5%] h-[0.12em] w-[34%] rounded-full" style={{ backgroundColor: palette.accent }} />
        <ClampText lines={2} className="mt-[6%] font-bold leading-tight" style={{ color: palette.title, fontSize: "1.42em" }}>
          {slide.title}
        </ClampText>
        <ClampText lines={2} className="mt-[4%]" style={{ color: palette.body, fontSize: "0.62em" }}>
          {slide.subtitle}
        </ClampText>
      </div>
      <Badge palette={palette} num={index + 1} />
    </div>
  );
}

function ContentPreview({ slide, theme, index }: Props) {
  const variant = index % 8;
  const darkVariant = variant === 3;
  const palette = previewPalette(theme, slide.bgKey || (darkVariant ? "primary" : "bg"), darkVariant);
  const bullets = slide.bullets?.length
    ? slide.bullets
    : ["Noi dung chinh duoc trinh bay ngan gon.", "Co vi du va lap luan ro.", "Ket noi voi muc tieu thuyet trinh."];

  const header = (
    <>
      <ClampText lines={1} className="font-bold uppercase tracking-[0.2em]" style={{ color: palette.caption, fontSize: "0.38em" }}>
        {slide.subtitle || "Noi dung"}
      </ClampText>
      <ClampText lines={2} className="mt-[1.5%] font-bold leading-tight" style={{ color: palette.title, fontSize: "1.08em" }}>
        {slide.title}
      </ClampText>
    </>
  );

  return (
    <div className="absolute inset-0 flex flex-col" style={{ ...gradientStyle(palette, index), padding: "5.2%" }}>
      {variant !== 3 && header}

      {variant === 0 && (
        <div className="mt-[4%] grid min-h-0 flex-1 grid-cols-[1fr_1fr] gap-[5%]">
          <BulletList bullets={bullets} palette={palette} />
          <ImageBlock slide={slide} index={index} overlayColor={withAlpha(palette.bgBase, 0.14)} />
        </div>
      )}

      {variant === 1 && (
        <div className="mt-[4%] grid min-h-0 flex-1 grid-cols-[1fr_1fr] gap-[5%]">
          <ImageBlock slide={slide} index={index} overlayColor={withAlpha(palette.bgBase, 0.14)} />
          <BulletList bullets={bullets} palette={palette} />
        </div>
      )}

      {variant === 2 && (
        <div className="mt-[4%] grid min-h-0 flex-1 grid-cols-2 gap-[3%]">
          {bullets.slice(0, 4).map((item, i) => (
            <div
              key={`${i}-${item}`}
              className="rounded-md p-[6%]"
              style={{
                backgroundColor: i % 2 === 0 ? withAlpha(palette.panelSoft, 0.9) : withAlpha(palette.panel, 0.88),
                border: `1px solid ${withAlpha(palette.panelLine, 0.75)}`,
              }}
            >
              <div className="font-bold" style={{ color: palette.accent, fontSize: "0.72em" }}>
                0{i + 1}
              </div>
              <ClampText lines={3} className="mt-[7%]" style={{ color: palette.body, fontSize: "0.56em", lineHeight: 1.25 }}>
                {item}
              </ClampText>
            </div>
          ))}
        </div>
      )}

      {variant === 3 && (
        <div className="absolute inset-0 overflow-hidden">
          <ImageBlock slide={slide} index={index} className="absolute inset-0 rounded-none" overlayColor={withAlpha(palette.bgBase, 0.22)} />
          <div className="absolute inset-0" style={{ backgroundColor: withAlpha(palette.bgBase, 0.24) }} />
          <div
            className="absolute left-[5.2%] top-[8%] flex h-[84%] w-[50%] flex-col rounded-md p-[4%]"
            style={{
              backgroundColor: withAlpha(palette.panel, 0.84),
              border: `1px solid ${withAlpha(palette.panelLine, 0.82)}`,
            }}
          >
            <ClampText lines={1} className="font-bold uppercase tracking-[0.2em]" style={{ color: palette.caption, fontSize: "0.38em" }}>
              {slide.subtitle || "Trong tam"}
            </ClampText>
            <ClampText lines={3} className="mt-[5%] font-bold leading-tight" style={{ color: palette.title, fontSize: "1.08em" }}>
              {slide.title}
            </ClampText>
            <div className="mt-[8%] min-h-0 flex-1">
              <BulletList bullets={bullets} palette={palette} textColor={palette.body} />
            </div>
          </div>
        </div>
      )}

      {variant === 4 && (
        <div className="mt-[4%] flex min-h-0 flex-1 flex-col gap-[5%]">
          <div className="grid h-[52%] grid-cols-4 gap-[2.4%]">
            {bullets.slice(0, 4).map((item, i) => (
              <div
                key={`${i}-${item}`}
                className="rounded-md p-[9%]"
                style={{
                  backgroundColor: i % 2 === 0 ? withAlpha(palette.panelSoft, 0.9) : withAlpha(palette.panel, 0.88),
                  border: `1px solid ${withAlpha(palette.panelLine, 0.75)}`,
                }}
              >
                <div className="font-bold" style={{ color: palette.accent, fontSize: "0.68em" }}>
                  0{i + 1}
                </div>
                <ClampText lines={4} className="mt-[12%]" style={{ color: palette.body, fontSize: "0.48em", lineHeight: 1.2 }}>
                  {item}
                </ClampText>
              </div>
            ))}
          </div>
          <ImageBlock slide={slide} index={index} className="min-h-0 flex-1" overlayColor={withAlpha(palette.bgBase, 0.14)} />
        </div>
      )}

      {variant === 5 && (
        <div className="mt-[4%] grid min-h-0 flex-1 grid-cols-[0.9fr_1.2fr] gap-[5%]">
          <div className="rounded-md p-[7%]" style={{ backgroundColor: withAlpha(palette.panelSoft, 0.9), border: `1px solid ${withAlpha(palette.panelLine, 0.75)}` }}>
            <ClampText lines={4} className="font-bold leading-tight" style={{ color: palette.title, fontSize: "0.94em" }}>
              {bullets[0]}
            </ClampText>
            <ClampText lines={3} className="mt-[10%]" style={{ color: palette.muted, fontSize: "0.55em", lineHeight: 1.25 }}>
              {bullets[1] || slide.imageDescription}
            </ClampText>
          </div>
          <div className="flex min-h-0 flex-col gap-[6%]">
            <ImageBlock slide={slide} index={index} className="h-[47%]" overlayColor={withAlpha(palette.bgBase, 0.14)} />
            <div className="min-h-0 flex-1">
              <BulletList bullets={bullets.slice(2)} palette={palette} max={4} />
            </div>
          </div>
        </div>
      )}

      {variant === 6 && (
        <div className="absolute inset-0 overflow-hidden">
          <ImageBlock slide={slide} index={index} className="absolute inset-0 rounded-none" overlayColor={withAlpha(palette.bgBase, 0.2)} />
          <div className="absolute inset-0" style={{ backgroundColor: withAlpha(palette.bgBase, 0.22) }} />
          <div className="absolute left-[11%] top-[12%] w-[78%]">
            <ClampText lines={1} className="text-center font-bold uppercase tracking-[0.2em]" style={{ color: palette.caption, fontSize: "0.38em" }}>
              {slide.subtitle || "Center focus"}
            </ClampText>
            <ClampText lines={2} className="mt-[2%] text-center font-bold leading-tight" style={{ color: palette.title, fontSize: "1.12em" }}>
              {slide.title}
            </ClampText>
          </div>
          <div
            className="absolute left-[11%] top-[40%] h-[46%] w-[78%] rounded-md p-[3.8%]"
            style={{
              backgroundColor: withAlpha(palette.panel, 0.84),
              border: `1px solid ${withAlpha(palette.panelLine, 0.82)}`,
            }}
          >
            <BulletList bullets={bullets} palette={palette} max={5} />
          </div>
        </div>
      )}

      {variant === 7 && (
        <div className="mt-[4%] grid min-h-0 flex-1 grid-cols-[1.15fr_0.9fr] gap-[5%]">
          <ImageBlock slide={slide} index={index} className="h-full" overlayColor={withAlpha(palette.bgBase, 0.12)} />
          <div
            className="rounded-md p-[7%]"
            style={{
              backgroundColor: withAlpha(palette.panelSoft, 0.88),
              border: `1px solid ${withAlpha(palette.panelLine, 0.78)}`,
            }}
          >
            <BulletList bullets={bullets} palette={palette} max={6} />
          </div>
        </div>
      )}

      <Badge palette={palette} num={index + 1} />
    </div>
  );
}

function SummaryPreview({ slide, theme, index, groupName, references }: Props) {
  const bullets = slide.bullets?.length
    ? slide.bullets
    : ["Tom tat noi dung chinh.", "Nhan manh gia tri thuc tien.", "Mo phan hoi dap."];
  const palette = previewPalette(theme, slide.bgKey || "bg", true);
  return (
    <div className="absolute inset-0 grid grid-cols-[1.45fr_0.9fr] gap-[5%]" style={{ ...gradientStyle(palette, index), padding: "5.2%" }}>
      <div className="min-h-0">
        <ClampText lines={2} className="font-bold leading-tight" style={{ color: palette.title, fontSize: "1.24em" }}>
          {slide.title || "Tong ket"}
        </ClampText>
        <ClampText lines={1} className="mt-[4%] font-bold" style={{ color: palette.caption, fontSize: "0.5em" }}>
          {slide.subtitle || "Thong diep chinh"}
        </ClampText>
        <div className="mt-[8%] h-[56%]">
          <BulletList bullets={bullets} palette={palette} max={5} />
        </div>
      </div>
      <div className="rounded-md p-[8%]" style={{ backgroundColor: withAlpha(mix(palette.panel, palette.bgBase, 0.6), 0.94), border: `1px solid ${withAlpha(palette.panelLine, 0.75)}` }}>
        <div className="text-center font-bold leading-none" style={{ color: palette.title, fontSize: "1.8em" }}>
          Q&A
        </div>
        <ClampText className="mt-[10%] text-center font-bold" style={{ color: palette.body, fontSize: "0.52em" }}>
          {groupName || "GoogleSlideAI"}
        </ClampText>
        {references && references.length > 0 && (
          <div className="mt-[16%]">
            <div className="font-bold" style={{ color: palette.title, fontSize: "0.48em" }}>
              Tham khao
            </div>
            {references.slice(0, 4).map((ref, i) => (
              <ClampText key={`${i}-${ref}`} lines={1} className="mt-[6%]" style={{ color: palette.body, fontSize: "0.36em" }}>
                {ref}
              </ClampText>
            ))}
          </div>
        )}
      </div>
      <Badge palette={palette} num={index + 1} />
    </div>
  );
}

export function SlidePreview(props: Props) {
  const { slide, index } = props;
  const renderer = (() => {
    if (index === 0 || slide.type === "cover") return <CoverPreview {...props} />;
    if (slide.type === "toc") return <TocPreview {...props} />;
    if (slide.type === "section") return <SectionPreview {...props} />;
    if (slide.type === "summary") return <SummaryPreview {...props} />;
    return <ContentPreview {...props} />;
  })();

  return (
    <div className="slide-preview-frame relative overflow-hidden rounded-md" style={{ aspectRatio: "16 / 9", fontSize: "clamp(7px, 1.85cqw, 18px)", containerType: "inline-size" }}>
      {renderer}
    </div>
  );
}

export function SlideThumb(props: Props) {
  return (
    <div className="slide-preview-frame relative overflow-hidden rounded-sm" style={{ aspectRatio: "16 / 9", fontSize: "clamp(3px, 1.85cqw, 7px)", containerType: "inline-size" }}>
      {(() => {
        const { slide, index } = props;
        if (index === 0 || slide.type === "cover") return <CoverPreview {...props} />;
        if (slide.type === "toc") return <TocPreview {...props} />;
        if (slide.type === "section") return <SectionPreview {...props} />;
        if (slide.type === "summary") return <SummaryPreview {...props} />;
        return <ContentPreview {...props} />;
      })()}
    </div>
  );
}
