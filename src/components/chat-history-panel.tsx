"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import {
  ChatHistoryItem,
  ModuleType,
  clearHistory,
  deleteHistory,
  getHistory,
} from "@/lib/chat-history";

const MODULE_CONFIG: Record<
  ModuleType,
  { label: string; color: string; icon: React.ReactNode }
> = {
  slide: {
    label: "Slide",
    color: "#67e8f9",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </svg>
    ),
  },
  word: {
    label: "Word",
    color: "#a78bfa",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" strokeLinecap="round" />
      </svg>
    ),
  },
  excel: {
    label: "Excel",
    color: "#34d399",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
  },
  code: {
    label: "Code",
    color: "#fbbf24",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
};

type FilterKey = "all" | ModuleType;

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(timestamp).toLocaleDateString("vi-VN");
}

interface ChatHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  onSelectItem: (item: ChatHistoryItem) => void;
}

export function ChatHistoryPanel({ open, onClose, onSelectItem }: ChatHistoryPanelProps) {
  const reduce = useReducedMotion();
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [confirmClear, setConfirmClear] = useState(false);

  const loadItems = useCallback(() => {
    const data = getHistory(filter === "all" ? undefined : filter);
    setItems(data);
  }, [filter]);

  useEffect(() => {
    if (open) {
      loadItems();
      setConfirmClear(false);
    }
  }, [open, loadItems]);

  function handleDelete(id: string) {
    deleteHistory(id);
    loadItems();
  }

  function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearHistory(filter === "all" ? undefined : filter);
    loadItems();
    setConfirmClear(false);
  }

  function handleSelect(item: ChatHistoryItem) {
    onSelectItem(item);
    onClose();
  }

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "slide", label: "Slide" },
    { key: "word", label: "Word" },
    { key: "excel", label: "Excel" },
    { key: "code", label: "Code" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Lịch sử hoạt động"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Đóng"
            className="absolute inset-0 bg-black/70"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="glass-surface relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
                  Lịch sử
                </p>
                <h2 className="mt-1.5 text-xl font-bold text-white">
                  Hoạt động gần đây
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {items.length} phiên đã ghi nhận
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/35"
              >
                Đóng
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setFilter(f.key);
                    setConfirmClear(false);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    filter === f.key
                      ? "border-cyan-300 bg-cyan-300/10 text-cyan-200"
                      : "border-white/15 text-slate-400 hover:border-white/30"
                  }`}
                >
                  {f.label}
                </button>
              ))}

              <div className="flex-1" />

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    confirmClear
                      ? "border-red-400 bg-red-950/40 text-red-200"
                      : "border-white/15 text-slate-500 hover:border-red-400/50 hover:text-red-300"
                  }`}
                >
                  {confirmClear ? "Xác nhận xoá?" : "Xoá tất cả"}
                </button>
              )}
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-3">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-12 w-12 text-slate-700"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" strokeLinecap="round" />
                  </svg>
                  <p className="mt-4 text-sm font-semibold text-slate-500">
                    Chưa có lịch sử nào
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Tạo slide, word, excel hoặc phân tích code để bắt đầu
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {items.map((item) => {
                    const config = MODULE_CONFIG[item.module];
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={reduce ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -40, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="group mb-2 flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition hover:border-white/15 hover:bg-white/[0.05]"
                      >
                        {/* Module icon */}
                        <div
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                          style={{ backgroundColor: `${config.color}15`, color: config.color }}
                        >
                          {config.icon}
                        </div>

                        {/* Content — clickable */}
                        <button
                          type="button"
                          onClick={() => handleSelect(item)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
                              style={{
                                backgroundColor: `${config.color}15`,
                                color: config.color,
                              }}
                            >
                              {config.label}
                            </span>
                            <span className="text-[10px] text-slate-600">
                              {formatTimeAgo(item.timestamp)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-200">
                            {item.title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {item.prompt}
                          </p>
                        </button>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-600 opacity-0 transition hover:bg-red-950/40 hover:text-red-400 group-hover:opacity-100"
                          aria-label="Xoá"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                          </svg>
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
