import type { HistoryEntry } from "./types";

const LS_HISTORY = "slicerai.history";

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch { return []; }
}

export function saveHistory(entry: HistoryEntry) {
  const all = loadHistory();
  all.unshift(entry);
  localStorage.setItem(LS_HISTORY, JSON.stringify(all.slice(0, 50)));
}

export function clearHistory() {
  localStorage.removeItem(LS_HISTORY);
}
