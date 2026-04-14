"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormEvent, useCallback, useState } from "react";
import type { AiExcelData, ExcelPreviewResponse } from "@/lib/schemas";
import { saveHistory } from "@/lib/chat-history";

const STEPS = [
  "Phân tích yêu cầu dữ liệu",
  "Tạo cấu trúc bảng tính",
  "Sinh dữ liệu chi tiết",
  "Định dạng Excel chuyên nghiệp",
  "Chuẩn bị preview và file",
];

function downloadBase64(base64: string, fileName: string) {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

export function ExcelProcessor({ apiKey }: { apiKey: string }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("input");
  const [description, setDescription] = useState("Bảng thống kê doanh thu các sản phẩm công nghệ tại Việt Nam năm 2024, bao gồm doanh số, lợi nhuận và tỷ lệ tăng trưởng");
  const [sheetCount, setSheetCount] = useState(1);
  const [uploadedData, setUploadedData] = useState("");
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [preview, setPreview] = useState<ExcelPreviewResponse | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError("");
      if (description.trim().length < 8) {
        setError("Hãy nhập mô tả dữ liệu rõ hơn (ít nhất 8 ký tự).");
        return;
      }

      setPhase("generating");
      setActiveStep(0);
      const interval = setInterval(() => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1)), 1100);

      try {
        const response = await fetch("/api/excel/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            sheetCount,
            language: "Tiếng Việt",
            uploadedData,
            apiKeys: apiKey ? [apiKey] : [],
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message || "Không thể tạo bảng tính.");
        }
        const data = (await response.json()) as ExcelPreviewResponse;
        setPreview(data);
        setActiveSheet(0);
        setPhase("preview");
        saveHistory({
          module: "excel",
          title: data.data.title || description.slice(0, 60),
          prompt: description,
          metadata: { sheetCount, fileName: data.fileName },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đã có lỗi khi tạo bảng tính.");
        setPhase("input");
      } finally {
        clearInterval(interval);
      }
    },
    [apiKey, description, sheetCount, uploadedData],
  );

  function createNew() {
    setPreview(null);
    setPhase("input");
    setError("");
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setUploadedData(text.slice(0, 50000));
    };
    reader.readAsText(file);
  }

  if (phase === "generating") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <motion.section
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-surface w-full max-w-xl rounded-2xl p-8"
        >
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
          <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-white">Đang tạo bảng tính Excel</h2>
          <p className="mt-2 text-center text-sm leading-6 text-slate-400">{description.slice(0, 130)}</p>
          <div className="mt-8 space-y-3">
            {STEPS.map((step, index) => {
              const active = index <= activeStep;
              return (
                <div key={step} className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-emerald-400" : "bg-slate-700"}`} />
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
    const data = preview.data;
    const sheet = data.sheets[activeSheet];
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Bảng tính Excel</p>
            <h2 className="mt-1 text-xl font-bold text-white">{data.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => downloadBase64(preview.xlsxBase64, preview.fileName)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 3v11m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
              </svg>
              Tải file .xlsx
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={createNew}
              className="rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-slate-100 transition hover:border-emerald-400"
            >
              Tạo mới
            </motion.button>
          </div>
        </div>

        {data.analysis && (
          <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-950/20 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Phân tích dữ liệu</p>
            <p className="mt-2 text-sm leading-7 text-slate-300">{data.analysis}</p>
          </div>
        )}

        {data.sheets.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {data.sheets.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveSheet(idx)}
                className={`whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  idx === activeSheet
                    ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                    : "border-white/15 text-slate-400 hover:border-white/30"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {sheet && (
          <div className="glass-surface overflow-hidden rounded-2xl">
            {sheet.summary && (
              <div className="border-b border-white/10 px-5 py-3">
                <p className="text-sm text-slate-400">{sheet.summary}</p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.06]">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-emerald-300">#</th>
                    {sheet.headers.map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-emerald-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((row, rIdx) => (
                    <tr key={rIdx} className={`border-t border-white/[0.06] ${rIdx % 2 === 0 ? "bg-white/[0.02]" : ""} transition hover:bg-white/[0.05]`}>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{rIdx + 1}</td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className={`px-4 py-2.5 text-slate-300 ${typeof cell === "number" ? "text-right font-mono" : ""}`}>
                          {typeof cell === "number" ? cell.toLocaleString("vi-VN") : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/10 px-5 py-3 text-xs text-slate-500">
              {sheet.rows.length} dòng × {sheet.headers.length} cột
            </div>
          </div>
        )}
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
          Tạo & xử lý Excel bằng AI
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">
          Mô tả dữ liệu cần tạo hoặc upload file CSV/Text để AI phân tích và xuất file .xlsx chuyên nghiệp.
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
          <span className="mb-2 block text-sm font-bold text-slate-100">Mô tả dữ liệu bảng tính</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
            placeholder="Ví dụ: Bảng so sánh doanh thu 5 công ty tech lớn nhất Việt Nam 2020-2024..."
          />
        </label>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <span className="mb-2 block text-sm font-bold text-slate-100">Số sheet</span>
            <div className="flex gap-2">
              {[1, 2, 3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSheetCount(n)}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                    sheetCount === n ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-white/15 text-slate-400 hover:border-emerald-400"
                  }`}
                >
                  {n} sheet
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold text-slate-100">Upload file CSV/Text (tùy chọn)</span>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-white/20 bg-black/20 px-4 py-3 text-sm text-slate-400 transition hover:border-emerald-400">
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 16V8m0 0-3 3m3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20 16.7V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.3" strokeLinecap="round" />
              </svg>
              {uploadedData ? `Đã tải ${(uploadedData.length / 1024).toFixed(1)} KB` : "Chọn hoặc kéo file vào đây"}
              <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            className="rounded-lg bg-emerald-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
          >
            Tạo bảng tính Excel
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
