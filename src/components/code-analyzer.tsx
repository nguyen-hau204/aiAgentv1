"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormEvent, useCallback, useState } from "react";
import type { AiCodeAnalysis, CodeAnalysisResponse } from "@/lib/schemas";

const ANALYSIS_TYPES = [
  { value: "full", label: "Toàn diện", icon: "🔍" },
  { value: "review", label: "Code Review", icon: "📝" },
  { value: "refactor", label: "Refactor", icon: "♻️" },
  { value: "document", label: "Tài liệu", icon: "📖" },
  { value: "security", label: "Bảo mật", icon: "🔒" },
] as const;

const STEPS = [
  "Phân tích cấu trúc mã nguồn",
  "Kiểm tra lỗi và bad practices",
  "Đánh giá hiệu suất & bảo mật",
  "Tạo gợi ý cải tiến",
  "Tổng hợp kết quả phân tích",
];

const SEVERITY_CONFIG = {
  error: { label: "Lỗi", color: "text-red-400", bg: "bg-red-400/10 border-red-400/30", dot: "bg-red-400" },
  warning: { label: "Cảnh báo", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/30", dot: "bg-amber-400" },
  info: { label: "Thông tin", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30", dot: "bg-blue-400" },
  suggestion: { label: "Gợi ý", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30", dot: "bg-emerald-400" },
};

type Phase = "input" | "analyzing" | "results";

export function CodeAnalyzer({ apiKey }: { apiKey: string }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("input");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("auto");
  const [analysisType, setAnalysisType] = useState<string>("full");
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [analysis, setAnalysis] = useState<AiCodeAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<"issues" | "refactored" | "docs" | "security">("issues");

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError("");
      if (code.trim().length < 10) {
        setError("Hãy nhập mã nguồn để phân tích (ít nhất 10 ký tự).");
        return;
      }

      setPhase("analyzing");
      setActiveStep(0);
      const interval = setInterval(() => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1)), 1100);

      try {
        const response = await fetch("/api/code/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            language,
            analysisType,
            apiKeys: apiKey ? [apiKey] : [],
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message || "Không thể phân tích mã nguồn.");
        }
        const data = (await response.json()) as CodeAnalysisResponse;
        setAnalysis(data.analysis);
        setActiveTab("issues");
        setPhase("results");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đã có lỗi khi phân tích code.");
        setPhase("input");
      } finally {
        clearInterval(interval);
      }
    },
    [apiKey, code, language, analysisType],
  );

  function createNew() {
    setAnalysis(null);
    setPhase("input");
    setError("");
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCode(text.slice(0, 30000));
      // Auto-detect language from extension
      const ext = file.name.split(".").pop()?.toLowerCase();
      const langMap: Record<string, string> = {
        js: "javascript", ts: "typescript", py: "python", java: "java",
        cpp: "cpp", c: "c", cs: "csharp", rb: "ruby", go: "go",
        rs: "rust", php: "php", swift: "swift", kt: "kotlin", dart: "dart",
        html: "html", css: "css", sql: "sql", sh: "bash",
      };
      if (ext && langMap[ext]) setLanguage(langMap[ext]);
    };
    reader.readAsText(file);
  }

  if (phase === "analyzing") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <motion.section
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-surface w-full max-w-xl rounded-2xl p-8"
        >
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
          <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-white">Đang phân tích mã nguồn</h2>
          <p className="mt-2 text-center text-sm text-slate-400">{code.split("\n").length} dòng code · {language === "auto" ? "Tự phát hiện" : language}</p>
          <div className="mt-8 space-y-3">
            {STEPS.map((step, index) => {
              const active = index <= activeStep;
              return (
                <div key={step} className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-amber-400" : "bg-slate-700"}`} />
                  <span className={`text-sm ${active ? "text-slate-100" : "text-slate-500"}`}>{step}</span>
                </div>
              );
            })}
          </div>
        </motion.section>
      </div>
    );
  }

  if (phase === "results" && analysis) {
    const scoreColor = analysis.qualityScore >= 80 ? "text-emerald-400" : analysis.qualityScore >= 60 ? "text-amber-400" : "text-red-400";
    const scoreRing = analysis.qualityScore >= 80 ? "border-emerald-400" : analysis.qualityScore >= 60 ? "border-amber-400" : "border-red-400";
    const issuesByType = {
      error: analysis.issues.filter((i) => i.severity === "error"),
      warning: analysis.issues.filter((i) => i.severity === "warning"),
      info: analysis.issues.filter((i) => i.severity === "info"),
      suggestion: analysis.issues.filter((i) => i.severity === "suggestion"),
    };

    const tabs = [
      { key: "issues" as const, label: `Vấn đề (${analysis.issues.length})`, show: true },
      { key: "refactored" as const, label: "Code cải tiến", show: Boolean(analysis.refactoredCode) },
      { key: "docs" as const, label: "Tài liệu", show: Boolean(analysis.documentation) },
      { key: "security" as const, label: "Bảo mật", show: Boolean(analysis.securityNotes?.length) },
    ].filter((t) => t.show);

    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Phân tích mã nguồn</p>
            <h2 className="mt-1 text-xl font-bold text-white">Kết quả — {analysis.language}</h2>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={createNew}
            className="rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-slate-100 transition hover:border-amber-400"
          >
            Phân tích mới
          </motion.button>
        </div>

        {/* Score + Summary */}
        <div className="mb-6 grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="glass-surface flex flex-col items-center justify-center rounded-2xl p-6">
            <div className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${scoreRing}`}>
              <span className={`text-2xl font-bold ${scoreColor}`}>{analysis.qualityScore}</span>
            </div>
            <span className="mt-2 text-xs font-semibold text-slate-400">Điểm chất lượng</span>
          </div>
          <div className="glass-surface rounded-2xl p-5">
            <p className="text-sm leading-7 text-slate-300">{analysis.summary}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {Object.entries(issuesByType).map(([severity, items]) => {
                if (items.length === 0) return null;
                const config = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];
                return (
                  <div key={severity} className="flex items-center gap-2 text-xs font-semibold">
                    <span className={`h-2 w-2 rounded-full ${config.dot}`} />
                    <span className={config.color}>{items.length} {config.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                activeTab === t.key
                  ? "border-amber-400 bg-amber-400/10 text-amber-200"
                  : "border-white/15 text-slate-400 hover:border-white/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="glass-surface rounded-2xl p-5 md:p-6">
          {activeTab === "issues" && (
            <div className="space-y-3">
              {analysis.issues.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Không phát hiện vấn đề nào! 🎉</p>
              ) : (
                analysis.issues.map((issue, idx) => {
                  const config = SEVERITY_CONFIG[issue.severity];
                  return (
                    <div key={idx} className={`rounded-lg border p-4 ${config.bg}`}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${config.dot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold uppercase ${config.color}`}>{config.label}</span>
                            {issue.line && <span className="text-xs text-slate-500">Dòng {issue.line}</span>}
                          </div>
                          <p className="mt-1 text-sm text-slate-200">{issue.message}</p>
                          {issue.suggestion && (
                            <p className="mt-2 text-xs leading-5 text-slate-400">
                              <span className="font-bold text-slate-300">Gợi ý:</span> {issue.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "refactored" && analysis.refactoredCode && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Code đã cải tiến</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(analysis.refactoredCode || "")}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-amber-400"
                >
                  Sao chép
                </button>
              </div>
              <pre className="max-h-[60vh] overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-xs leading-6 text-slate-300">
                <code>{analysis.refactoredCode}</code>
              </pre>
            </div>
          )}

          {activeTab === "docs" && analysis.documentation && (
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Tài liệu tự động</span>
              <pre className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-xs leading-6 text-slate-300 whitespace-pre-wrap">
                {analysis.documentation}
              </pre>
            </div>
          )}

          {activeTab === "security" && analysis.securityNotes && (
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Ghi chú bảo mật</span>
              {analysis.securityNotes.map((note, idx) => (
                <div key={idx} className="mt-2 rounded-lg border border-red-400/20 bg-red-950/20 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-red-400">🔒</span>
                    <p className="text-sm text-slate-300">{note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
          Phân tích mã nguồn bằng AI
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">
          Paste code hoặc upload file — AI sẽ review, tìm lỗi, gợi ý refactor, viết tài liệu và kiểm tra bảo mật.
        </p>
      </motion.div>

      <motion.form
        onSubmit={submit}
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.06 }}
        className="glass-surface mt-6 rounded-2xl p-5 md:p-7"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-slate-100">Mã nguồn</span>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-amber-400">
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 16V8m0 0-3 3m3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 16.7V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.3" strokeLinecap="round" />
            </svg>
            Upload file
            <input type="file" accept=".js,.ts,.py,.java,.cpp,.c,.cs,.rb,.go,.rs,.php,.swift,.kt,.dart,.html,.css,.sql,.sh,.tsx,.jsx" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={12}
          className="w-full resize-none rounded-lg border border-white/15 bg-black/50 px-4 py-3 font-mono text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-amber-400"
          placeholder="// Paste mã nguồn vào đây...&#10;function example() {&#10;  return 'Hello World';&#10;}"
          spellCheck={false}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <span className="mb-2 block text-sm font-bold text-slate-100">Ngôn ngữ</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-400"
            >
              <option value="auto">Tự phát hiện</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="csharp">C#</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="php">PHP</option>
              <option value="ruby">Ruby</option>
              <option value="swift">Swift</option>
              <option value="kotlin">Kotlin</option>
              <option value="dart">Dart</option>
              <option value="sql">SQL</option>
              <option value="html">HTML/CSS</option>
            </select>
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold text-slate-100">Loại phân tích</span>
            <div className="flex flex-wrap gap-2">
              {ANALYSIS_TYPES.map((at) => (
                <button
                  key={at.value}
                  type="button"
                  onClick={() => setAnalysisType(at.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    analysisType === at.value
                      ? "border-amber-400 bg-amber-400/10 text-amber-200"
                      : "border-white/15 text-slate-400 hover:border-white/30"
                  }`}
                >
                  {at.icon} {at.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {code.split("\n").length} dòng · {(code.length / 1024).toFixed(1)} KB
          </p>
          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            className="rounded-lg bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
          >
            Phân tích code
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
    </div>
  );
}
