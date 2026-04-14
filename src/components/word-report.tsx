"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormEvent, useCallback, useState } from "react";
import type { AiReport, ReportPreviewResponse, ReportType } from "@/lib/schemas";
import { saveHistory } from "@/lib/chat-history";

const REPORT_TYPES: { value: ReportType; label: string; icon: string }[] = [
  { value: "academic", label: "Luận văn / Học thuật", icon: "🎓" },
  { value: "technical", label: "Báo cáo Kỹ thuật", icon: "⚙️" },
  { value: "business", label: "Báo cáo Kinh doanh", icon: "📊" },
  { value: "general", label: "Báo cáo Tổng hợp", icon: "📋" },
];

const STEPS = [
  "Phân tích yêu cầu báo cáo",
  "Tạo cấu trúc chương mục",
  "Viết nội dung chi tiết",
  "Định dạng Word chuyên nghiệp",
  "Chuẩn bị preview và tải file",
];

function downloadBase64(base64: string, fileName: string) {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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

type Phase = "input" | "generating" | "preview";

export function WordReport({ apiKey }: { apiKey: string }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("input");
  const [topic, setTopic] = useState("Phân tích ứng dụng trí tuệ nhân tạo trong quản lý giáo dục hiện đại");
  const [reportType, setReportType] = useState<ReportType>("academic");
  const [pageCount, setPageCount] = useState(5);
  const [authorName, setAuthorName] = useState("");
  const [organization, setOrganization] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [preview, setPreview] = useState<ReportPreviewResponse | null>(null);

  const [stepInterval, setStepInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError("");
      if (topic.trim().length < 8) {
        setError("Hãy nhập chủ đề rõ hơn (ít nhất 8 ký tự).");
        return;
      }

      setPhase("generating");
      setActiveStep(0);
      const interval = setInterval(() => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1)), 1200);
      setStepInterval(interval);

      try {
        const response = await fetch("/api/reports/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            reportType,
            pageCount,
            language: "Tiếng Việt",
            authorName,
            organization,
            additionalContext,
            apiKeys: apiKey ? [apiKey] : [],
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message || "Không thể tạo báo cáo.");
        }
        const data = (await response.json()) as ReportPreviewResponse;
        setPreview(data);
        setPhase("preview");
        saveHistory({
          module: "word",
          title: data.report.title || topic.slice(0, 60),
          prompt: topic,
          metadata: { reportType, pageCount, fileName: data.fileName },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đã có lỗi khi tạo báo cáo.");
        setPhase("input");
      } finally {
        clearInterval(interval);
        setStepInterval(null);
      }
    },
    [apiKey, topic, reportType, pageCount, authorName, organization, additionalContext],
  );

  function createNew() {
    setPreview(null);
    setPhase("input");
    setError("");
  }

  if (phase === "generating") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <motion.section
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-surface w-full max-w-xl rounded-2xl p-8"
        >
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-violet-400 border-t-transparent" />
          <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-white">Đang viết báo cáo Word</h2>
          <p className="mt-2 text-center text-sm leading-6 text-slate-400">{topic.slice(0, 130)}</p>
          <div className="mt-8 space-y-3">
            {STEPS.map((step, index) => {
              const active = index <= activeStep;
              return (
                <div key={step} className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-violet-400" : "bg-slate-700"}`} />
                  <span className={`text-sm ${active ? "text-slate-100" : "text-slate-500"}`}>{step}</span>
                </div>
              );
            })}
          </div>
        </motion.section>
      </div>
    );
  }

  if (phase === "preview" && preview) {
    const report = preview.report;
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Báo cáo Word</p>
            <h2 className="mt-1 text-xl font-bold text-white">{report.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => downloadBase64(preview.docxBase64, preview.fileName)}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-violet-300"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 3v11m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
              </svg>
              Tải file .docx
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={createNew}
              className="rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-slate-100 transition hover:border-violet-400"
            >
              Tạo mới
            </motion.button>
          </div>
        </div>

        <div className="glass-surface overflow-hidden rounded-2xl p-6 md:p-8">
          {report.abstract && (
            <div className="mb-6 rounded-xl border border-violet-400/20 bg-violet-950/20 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Tóm tắt</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">{report.abstract}</p>
            </div>
          )}

          {report.sections.map((section, idx) => (
            <div key={`${idx}-${section.heading}`} className="mb-5">
              <h3
                className="font-bold text-white"
                style={{ fontSize: section.level === 1 ? "1.25rem" : section.level === 2 ? "1.1rem" : "1rem" }}
              >
                {section.heading}
              </h3>
              {section.paragraphs.map((para, pIdx) => (
                <p key={pIdx} className="mt-2 text-sm leading-7 text-slate-300">
                  {para}
                </p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-2 space-y-1 pl-5">
                  {section.bullets.map((b, bIdx) => (
                    <li key={bIdx} className="list-disc text-sm leading-6 text-slate-400">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
              {section.tableData && section.tableData.headers.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/[0.06]">
                        {section.tableData.headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-bold text-violet-300">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.tableData.rows.map((row, rIdx) => (
                        <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-white/[0.02]" : ""}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3 py-2 text-slate-400">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {report.conclusion && (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Kết luận</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">{report.conclusion}</p>
            </div>
          )}

          {report.references.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Tài liệu tham khảo</p>
              <ol className="mt-2 space-y-1 pl-5">
                {report.references.map((ref, idx) => (
                  <li key={idx} className="list-decimal text-xs leading-5 text-slate-500">
                    {ref}
                  </li>
                ))}
              </ol>
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
          Viết báo cáo Word bằng AI
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">
          Nhập chủ đề, chọn loại báo cáo và AI sẽ tự viết nội dung chuyên nghiệp, xuất file .docx sẵn sàng nộp.
        </p>
      </motion.div>

      <motion.form
        onSubmit={submit}
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.06 }}
        className="glass-surface mt-6 rounded-2xl p-5 md:p-7"
      >
        <label>
          <span className="mb-2 block text-sm font-bold text-slate-100">Chủ đề báo cáo</span>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400"
            placeholder="Ví dụ: Phân tích tác động của AI trong lĩnh vực y tế Việt Nam..."
          />
        </label>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <span className="mb-2 block text-sm font-bold text-slate-100">Loại báo cáo</span>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  type="button"
                  onClick={() => setReportType(rt.value)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition ${
                    reportType === rt.value
                      ? "border-violet-400 bg-violet-400/10 text-violet-200"
                      : "border-white/15 text-slate-400 hover:border-white/30"
                  }`}
                >
                  <span className="mr-1.5">{rt.icon}</span>
                  {rt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label>
              <span className="mb-2 block text-sm font-bold text-slate-100">Số trang (ước tính)</span>
              <input
                type="number"
                min={1}
                max={50}
                value={pageCount}
                onChange={(e) => setPageCount(Number(e.target.value))}
                className="w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-slate-100 outline-none focus:border-violet-400"
              />
            </label>
            <div className="flex gap-2">
              {[3, 5, 8, 10, 15].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPageCount(n)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    pageCount === n ? "border-violet-400 bg-violet-400 text-slate-950" : "border-white/15 text-slate-400 hover:border-violet-400"
                  }`}
                >
                  {n} trang
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-bold text-slate-100">Tên tác giả</span>
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-slate-100 outline-none focus:border-violet-400"
              placeholder="Nguyễn Văn A"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold text-slate-100">Tổ chức / Trường</span>
            <input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-slate-100 outline-none focus:border-violet-400"
              placeholder="Đại học Bách khoa"
            />
          </label>
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold text-slate-100">Bối cảnh bổ sung (tùy chọn)</span>
          <textarea
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400"
            placeholder="Paste nội dung tham khảo, yêu cầu đặc biệt, v.v..."
          />
        </label>

        <div className="mt-6 flex items-center justify-end">
          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            className="rounded-lg bg-violet-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-violet-300"
          >
            Tạo báo cáo Word
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
