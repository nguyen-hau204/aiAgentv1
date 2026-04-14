"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { GoogleSlideAIApp } from "./google-slide-ai-app";
import { WordReport } from "./word-report";
import { ExcelProcessor } from "./excel-processor";
import { CodeAnalyzer } from "./code-analyzer";

type ModuleKey = "slide" | "word" | "excel" | "code";

const API_KEY_STORAGE = "googleslideai.gemini-key.v1";

const MODULES: { key: ModuleKey; label: string; icon: React.ReactNode; accent: string; description: string }[] = [
  {
    key: "slide",
    label: "Slide",
    accent: "#67e8f9",
    description: "Tạo PowerPoint bằng AI",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "word",
    label: "Word",
    accent: "#a78bfa",
    description: "Viết báo cáo tự động",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6M8 9h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "excel",
    label: "Excel",
    accent: "#34d399",
    description: "Tạo & xử lý bảng tính",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
  },
  {
    key: "code",
    label: "Code",
    accent: "#fbbf24",
    description: "Phân tích mã nguồn",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function SettingsIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a7.9 7.9 0 0 0 .1-1l1.6-1.2-1.6-2.8-1.9.6a7.7 7.7 0 0 0-.9-.5L14.8 6h-3.6l-.9 3.1c-.3.1-.6.3-.9.5l-1.9-.6-1.6 2.8L7.5 14a7.9 7.9 0 0 0 .1 1L6 16.2 7.6 19l1.9-.6c.3.2.6.3.9.5l.9 3.1h3.6l.9-3.1c.3-.1.6-.3.9-.5l1.9.6 1.6-2.8L19.4 15Z" />
    </svg>
  );
}

export function Dashboard() {
  const reduce = useReducedMotion();
  const [activeModule, setActiveModule] = useState<ModuleKey>("slide");
  const [apiKey, setApiKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const currentModule = useMemo(
    () => MODULES.find((m) => m.key === activeModule) || MODULES[0],
    [activeModule],
  );

  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(API_KEY_STORAGE) || "");
    } catch {
      setApiKey("");
    }
  }, []);

  function saveKey(nextKey: string) {
    setApiKey(nextKey.trim());
    try {
      if (nextKey.trim()) localStorage.setItem(API_KEY_STORAGE, nextKey.trim());
      else localStorage.removeItem(API_KEY_STORAGE);
    } catch {
      /* localStorage can be blocked */
    }
  }

  return (
    <div className="flex min-h-[100dvh] text-slate-100">
      <div className="soft-grid fixed inset-0 -z-10 opacity-30" />

      {/* Animated gradient background that changes with active module */}
      <div
        className="fixed inset-0 -z-10 transition-all duration-1000"
        style={{
          background: `radial-gradient(ellipse at 20% 50%, ${currentModule.accent}08 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${currentModule.accent}05 0%, transparent 40%)`,
        }}
      />

      {/* Desktop Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 hidden h-full flex-col border-r border-white/10 bg-[#080d15]/90 backdrop-blur-xl transition-all duration-300 md:flex ${
          sidebarCollapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          {!sidebarCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.24em]" style={{ color: currentModule.accent }}>
                AI DocHub
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">Gemini-powered Docs</p>
            </motion.div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-white/25 hover:text-white"
            aria-label={sidebarCollapsed ? "Mở rộng" : "Thu gọn"}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarCollapsed ? (
                <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M15 18 9 12l6-6" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {MODULES.map((mod) => {
            const isActive = activeModule === mod.key;
            return (
              <button
                key={mod.key}
                type="button"
                id={`nav-${mod.key}`}
                onClick={() => setActiveModule(mod.key)}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-200 ${
                  isActive
                    ? "bg-white/[0.08] text-white shadow-lg"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
                style={isActive ? { boxShadow: `0 0 20px ${mod.accent}15, inset 0 1px 0 ${mod.accent}20` } : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full"
                    style={{ backgroundColor: mod.accent }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span
                  className="shrink-0 transition-colors"
                  style={isActive ? { color: mod.accent } : undefined}
                >
                  {mod.icon}
                </span>
                {!sidebarCollapsed && (
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{mod.label}</p>
                    <p className="truncate text-[11px] text-slate-500 group-hover:text-slate-400">
                      {mod.description}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Settings */}
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-white ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
          >
            <SettingsIcon />
            {!sidebarCollapsed && "Cài đặt API"}
          </button>
          {!sidebarCollapsed && apiKey && (
            <div className="mt-2 flex items-center gap-2 px-3">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-emerald-400/80">API key đã lưu</span>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/10 bg-[#080d15]/95 backdrop-blur-xl md:hidden">
        {MODULES.map((mod) => {
          const isActive = activeModule === mod.key;
          return (
            <button
              key={mod.key}
              type="button"
              onClick={() => setActiveModule(mod.key)}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-semibold transition ${
                isActive ? "text-white" : "text-slate-500"
              }`}
              style={isActive ? { color: mod.accent } : undefined}
            >
              {mod.icon}
              {mod.label}
              {isActive && (
                <motion.div
                  layoutId="mobile-indicator"
                  className="absolute top-0 h-0.5 w-10 rounded-b-full"
                  style={{ backgroundColor: mod.accent }}
                />
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-semibold text-slate-500"
        >
          <SettingsIcon />
          API
        </button>
      </nav>

      {/* Main Content */}
      <main
        className={`flex-1 pb-20 transition-all duration-300 md:pb-0 ${sidebarCollapsed ? "md:ml-[4.5rem]" : "md:ml-64"}`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeModule}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeModule === "slide" && <GoogleSlideAIApp />}
            {activeModule === "word" && <WordReport apiKey={apiKey} />}
            {activeModule === "excel" && <ExcelProcessor apiKey={apiKey} />}
            {activeModule === "code" && <CodeAnalyzer apiKey={apiKey} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Settings Modal */}
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
              className="glass-surface relative w-full max-w-xl rounded-2xl p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em]" style={{ color: currentModule.accent }}>
                    Cài đặt
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Gemini API Key</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Key dùng chung cho tất cả module (Slide, Word, Excel, Code). Lưu trong localStorage.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/35"
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
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    apiKey
                      ? "border-emerald-400/35 bg-emerald-950/35 text-emerald-100"
                      : "border-white/15 text-slate-400"
                  }`}
                >
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

              <p className="mt-4 text-xs leading-5 text-slate-500">
                Nếu server đã có <span className="font-semibold text-slate-400">GEMINI_API_KEY</span> trong .env.local thì không cần nhập ở đây.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
