"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PreviewResponse } from "@/lib/schemas";
import { saveHistory } from "@/lib/chat-history";
import { SlidePreview, SlideThumb } from "./slide-preview";

type SpeechRecognitionCtor = new () => SpeechRecognition;
type SpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionEvent = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

type Phase = "input" | "generating" | "preview";

const API_KEY_STORAGE = "googleslideai.gemini-key.v1";
const STEPS = [
  "Phân tích yêu cầu tiếng Việt",
  "Tạo đúng số slide đã chọn",
  "Sinh nội dung và gợi ý hình ảnh",
  "Render .pptx bằng PptxGenJS",
  "Chuẩn bị preview toàn màn hình",
];

const SLIDE_OPTIONS = [5, 8, 10, 12, 15, 20];

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="3" width="6" height="11" rx="3" className={active ? "fill-cyan-300/20" : ""} />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      {dir === "left" ? (
        <path d="M15 18 9 12l6-6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a7.9 7.9 0 0 0 .1-1l1.6-1.2-1.6-2.8-1.9.6a7.7 7.7 0 0 0-.9-.5L14.8 6h-3.6l-.9 3.1c-.3.1-.6.3-.9.5l-1.9-.6-1.6 2.8L7.5 14a7.9 7.9 0 0 0 .1 1L6 16.2 7.6 19l1.9-.6c.3.2.6.3.9.5l.9 3.1h3.6l.9-3.1c.3-.1.6-.3.9-.5l1.9.6 1.6-2.8L19.4 15Z" />
    </svg>
  );
}

function downloadBase64(base64: string, fileName: string) {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function GoogleSlideAIApp() {
  const reduce = useReducedMotion();
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const [phase, setPhase] = useState<Phase>("input");
  const [command, setCommand] = useState(
    "Tạo bài thuyết trình 8 slide về ứng dụng AI trong giáo dục đại học, phong cách học thuật hiện đại, có ví dụ thực tế và phần kết luận rõ ràng.",
  );
  const [slideCount, setSlideCount] = useState(8);
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  const speechSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(API_KEY_STORAGE) || "");
    } catch {
      setApiKey("");
    }
  }, []);

  useEffect(() => {
    if (phase !== "generating") {
      setActiveStep(0);
      return;
    }
    const id = window.setInterval(() => setActiveStep((step) => Math.min(step + 1, STEPS.length - 1)), 1100);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "preview" || !preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        setCurrentSlide((slide) => Math.min(slide + 1, preview.slideCount - 1));
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        setCurrentSlide((slide) => Math.max(slide - 1, 0));
      }
      if (event.key === "Escape") {
        setPhase("input");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, preview]);

  function saveKey(nextKey: string) {
    setApiKey(nextKey.trim());
    try {
      if (nextKey.trim()) localStorage.setItem(API_KEY_STORAGE, nextKey.trim());
      else localStorage.removeItem(API_KEY_STORAGE);
    } catch {
      /* localStorage can be blocked in private mode. */
    }
  }

  function startVoice() {
    setError("");
    if (!speechSupported) {
      setError("Trình duyệt hiện tại chưa hỗ trợ Web Speech API.");
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();
      if (transcript) setCommand(transcript);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => {
      setIsListening(false);
      setError("Không nhận được giọng nói. Hãy thử lại hoặc nhập bằng văn bản.");
    };
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError("");
      if (command.trim().length < 8) {
        setError("Hãy nhập chủ đề hoặc yêu cầu chi tiết hơn.");
        return;
      }

      setPhase("generating");
      try {
        const response = await fetch("/api/presentations/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command,
            slideCount,
            language: "Tiếng Việt",
            groupName,
            members,
            apiKeys: apiKey ? [apiKey] : [],
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message || "Không thể tạo PowerPoint.");
        }
        const data = (await response.json()) as PreviewResponse;
        setPreview(data);
        setCurrentSlide(0);
        setPhase("preview");
        saveHistory({
          module: "slide",
          title: data.title || command.slice(0, 60),
          prompt: command,
          metadata: { slideCount, groupName, fileName: data.fileName },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đã có lỗi khi tạo bài thuyết trình.");
        setPhase("input");
      }
    },
    [apiKey, command, groupName, members, slideCount],
  );

  function createNew() {
    setPreview(null);
    setCurrentSlide(0);
    setPhase("input");
    setError("");
  }

  if (phase === "preview" && preview) {
    const active = preview.slides[currentSlide];
    return (
      <main className="fixed inset-0 z-50 flex flex-col bg-[#05070a] text-slate-100">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 lg:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">GoogleSlideAI</p>
            <p className="mt-1 hidden truncate text-sm text-slate-400 md:block">{preview.title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => downloadBase64(preview.pptxBase64, preview.fileName)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 md:px-5"
            >
              <DownloadIcon />
              <span className="hidden sm:inline">Tải file PowerPoint (.pptx)</span>
              <span className="sm:hidden">Tải PPTX</span>
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={createNew}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm font-bold text-slate-100 transition hover:border-cyan-300 hover:text-white md:px-5"
            >
              <PlusIcon />
              <span className="hidden sm:inline">Tạo bài mới</span>
              <span className="sm:hidden">Bài mới</span>
            </motion.button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[15rem_1fr]">
          <aside className="hidden min-h-0 overflow-y-auto border-r border-white/10 bg-white/[0.03] p-3 lg:block">
            {preview.slides.map((slide, index) => (
              <button
                key={`${slide.title}-${index}`}
                type="button"
                onClick={() => setCurrentSlide(index)}
                className={`mb-3 w-full rounded-lg border p-1.5 text-left transition ${
                  index === currentSlide ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-black/20 hover:border-white/30"
                }`}
              >
                <SlideThumb
                  slide={slide}
                  index={index}
                  total={preview.slideCount}
                  theme={preview.theme}
                  title={preview.title}
                  subtitle={preview.subtitle}
                  groupName={groupName}
                  members={members}
                  references={preview.references}
                />
                <p className="mt-2 truncate px-1 text-xs text-slate-300">
                  {index + 1}. {slide.title}
                </p>
              </button>
            ))}
          </aside>

          <section className="flex min-h-0 flex-col items-center justify-center gap-4 overflow-hidden p-4 md:p-6">
            <div className="w-full max-w-6xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentSlide}
                  initial={reduce ? false : { opacity: 0, y: 12, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.985 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="shadow-[0_24px_90px_rgba(0,0,0,0.45)]"
                >
                  <SlidePreview
                    slide={active}
                    index={currentSlide}
                    total={preview.slideCount}
                    theme={preview.theme}
                    title={preview.title}
                    subtitle={preview.subtitle}
                    groupName={groupName}
                    members={members}
                    references={preview.references}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentSlide((slide) => Math.max(slide - 1, 0))}
                disabled={currentSlide === 0}
                className="rounded-lg border border-white/15 p-3 text-slate-200 transition hover:border-cyan-300 disabled:opacity-35"
                aria-label="Slide trước"
              >
                <ArrowIcon dir="left" />
              </button>
              <span className="min-w-28 text-center text-sm font-semibold text-slate-300">
                {currentSlide + 1} / {preview.slideCount}
              </span>
              <button
                type="button"
                onClick={() => setCurrentSlide((slide) => Math.min(slide + 1, preview.slideCount - 1))}
                disabled={currentSlide === preview.slideCount - 1}
                className="rounded-lg border border-white/15 p-3 text-slate-200 transition hover:border-cyan-300 disabled:opacity-35"
                aria-label="Slide sau"
              >
                <ArrowIcon dir="right" />
              </button>
            </div>

            {active.speakerNotes && (
              <div className="max-h-28 w-full max-w-6xl overflow-y-auto rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Speaker Notes</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">{active.speakerNotes}</p>
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (phase === "generating") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-4 text-slate-100">
        <div className="soft-grid fixed inset-0 -z-10 opacity-45" />
        <motion.section
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-surface w-full max-w-xl rounded-lg p-8"
        >
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-cyan-300 border-t-transparent" />
          <h1 className="mt-6 text-center text-2xl font-bold tracking-tight text-white">Đang tạo bài thuyết trình</h1>
          <p className="mt-2 text-center text-sm leading-6 text-slate-400">{command.slice(0, 130)}</p>
          <div className="mt-8 space-y-3">
            {STEPS.map((step, index) => {
              const active = index <= activeStep;
              return (
                <div key={step} className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-cyan-300" : "bg-slate-700"}`} />
                  <span className={`text-sm ${active ? "text-slate-100" : "text-slate-500"}`}>{step}</span>
                </div>
              );
            })}
          </div>
        </motion.section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] overflow-hidden text-slate-100">
      <div className="soft-grid fixed inset-0 -z-10 opacity-35" />
      <div className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-4 py-6 md:px-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">GoogleSlideAI</p>
            <p className="mt-2 text-sm text-slate-400">Voice input, Gemini, PptxGenJS</p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300"
          >
            <SettingsIcon />
            Cài đặt API
          </button>
        </header>

        <section className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-12">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-white md:text-6xl">
              Tạo PowerPoint tiếng Việt có preview trước khi tải
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300">
              Nhập chủ đề, số slide, tên nhóm và thành viên. Ứng dụng tạo outline bằng Gemini, dựng file .pptx bằng PptxGenJS và chỉ tải khi bạn bấm nút.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
              {["Đúng số slide", "Ảnh minh họa", "Preview kiểu PowerPoint"].map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                  {item}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.form
            onSubmit={submit}
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="glass-surface rounded-lg p-5 md:p-7"
          >
            <div className="flex flex-col gap-5 md:flex-row">
              <button
                type="button"
                onClick={isListening ? stopVoice : startVoice}
                className={`grid h-24 w-full shrink-0 place-items-center rounded-lg border text-white transition md:w-24 ${
                  isListening ? "border-cyan-300 bg-cyan-300/15" : "border-white/15 bg-black/30 hover:border-cyan-300"
                }`}
                aria-pressed={isListening}
                aria-label={isListening ? "Dừng nhập giọng nói" : "Nhập bằng giọng nói"}
              >
                <MicIcon active={isListening} />
                <span className="text-xs font-semibold md:hidden">{isListening ? "Đang nghe" : "Nhấn để nói"}</span>
              </button>

              <label className="min-w-0 flex-1">
                <span className="mb-2 block text-sm font-bold text-slate-100">Chủ đề hoặc yêu cầu trình bày</span>
                <textarea
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  rows={6}
                  className="w-full resize-none rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
                  placeholder="Ví dụ: Tạo bài 10 slide về chuyển đổi số trong giáo dục..."
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-100">Số slide</span>
                <input
                  type="number"
                  min={3}
                  max={30}
                  value={slideCount}
                  onChange={(event) => setSlideCount(Number(event.target.value))}
                  className="w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-slate-100 outline-none focus:border-cyan-300"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-100">Tên nhóm</span>
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-slate-100 outline-none focus:border-cyan-300"
                  placeholder="Nhóm 3"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-100">Thành viên</span>
                <input
                  value={members}
                  onChange={(event) => setMembers(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-slate-100 outline-none focus:border-cyan-300"
                  placeholder="Nguyễn A, Trần B"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {SLIDE_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setSlideCount(count)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    slideCount === count ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/15 text-slate-300 hover:border-cyan-300"
                  }`}
                >
                  {count} slide
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-400">
                API key cá nhân là tùy chọn nếu server đã có <span className="font-semibold text-slate-200">GEMINI_API_KEY</span> trong .env.local.
              </p>
              <motion.button
                type="submit"
                whileTap={{ scale: 0.98 }}
                className="rounded-lg bg-cyan-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
              >
                Tạo bài thuyết trình
              </motion.button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-4 rounded-lg border border-red-400/35 bg-red-950/40 px-4 py-3 text-sm text-red-100"
                  role="alert"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.form>
        </section>
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Cài đặt API"
          >
            <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/70" onClick={() => setSettingsOpen(false)} />
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="glass-surface relative w-full max-w-xl rounded-lg p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Cài đặt</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Gemini API Key</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Key được lưu trong localStorage của trình duyệt và gửi kèm khi tạo bài.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300"
                >
                  Đóng
                </button>
              </div>

              <label className="mt-6 block">
                <span className="mb-2 block text-sm font-bold text-slate-100">API Key</span>
                <input
                  value={apiKey}
                  onChange={(event) => saveKey(event.target.value)}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-slate-100 outline-none focus:border-cyan-300"
                  placeholder="AIza..."
                />
              </label>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${apiKey ? "border-emerald-400/35 bg-emerald-950/35 text-emerald-100" : "border-white/15 text-slate-400"}`}>
                  {apiKey ? "Đã lưu key cá nhân" : "Chưa lưu key cá nhân"}
                </span>
                <button
                  type="button"
                  onClick={() => saveKey("")}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-red-300"
                >
                  Xóa key
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
