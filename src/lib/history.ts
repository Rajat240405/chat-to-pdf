import type { ConversationDocument } from "@/lib/mock-data";

const STORAGE_KEY = "promptpress_history";

export function getHistory(): ConversationDocument[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(doc: ConversationDocument) {
  if (typeof window === "undefined") return;

  try {
    const history = getHistory();

    // Remove duplicate if it already exists
    const filtered = history.filter((d) => d.id !== doc.id);

    // Newest first
    filtered.unshift({
  ...doc,
  createdAt: new Date().toISOString(),
});

    // Keep last 20
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(filtered.slice(0, 20))
    );
  } catch {
    // Ignore storage failures
  }
}

export function getRecentHistory(limit = 3) {
  return getHistory().slice(0, limit);
}