/**
 * Chat History Manager — localStorage-based history tracking
 * Lưu lịch sử các phiên generate/analyze cho tất cả module.
 */

export type ModuleType = "slide" | "word" | "excel" | "code";

export interface ChatHistoryItem {
  id: string;
  module: ModuleType;
  title: string;
  prompt: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

const STORAGE_KEY = "aidochub.chat-history.v1";
const MAX_ITEMS = 50;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Retrieve all history items, optionally filtered by module. */
export function getHistory(module?: ModuleType): ChatHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items: ChatHistoryItem[] = JSON.parse(raw);
    if (module) return items.filter((item) => item.module === module);
    return items;
  } catch {
    return [];
  }
}

/** Save a new history item. Returns the created item. */
export function saveHistory(
  entry: Omit<ChatHistoryItem, "id" | "timestamp">,
): ChatHistoryItem {
  const item: ChatHistoryItem = {
    ...entry,
    id: generateId(),
    timestamp: Date.now(),
  };

  try {
    const items = getHistory();
    items.unshift(item);
    // Keep only the most recent MAX_ITEMS
    const trimmed = items.slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* localStorage may be full or blocked */
  }

  return item;
}

/** Delete a single history item by ID. */
export function deleteHistory(id: string): void {
  try {
    const items = getHistory();
    const filtered = items.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore */
  }
}

/** Clear all history, optionally filtered to a specific module. */
export function clearHistory(module?: ModuleType): void {
  try {
    if (!module) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      const items = getHistory();
      const filtered = items.filter((item) => item.module !== module);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch {
    /* ignore */
  }
}
