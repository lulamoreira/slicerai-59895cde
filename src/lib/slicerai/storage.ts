import type { HistoryEntry, SpecialPreset, SpecialOverride } from "./types";

const LS_HISTORY = "slicerai.history";
const LS_SPECIAL_PRESETS = "slicerai.specialPresets";

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entry: HistoryEntry) {
  const all = loadHistory();
  all.unshift(entry);
  localStorage.setItem(LS_HISTORY, JSON.stringify(all.slice(0, 50)));
}

export function clearHistory() {
  localStorage.removeItem(LS_HISTORY);
}

// -------- Special presets (user-defined advanced overrides) --------

export function loadSpecialPresets(): SpecialPreset[] {
  try {
    const raw = localStorage.getItem(LS_SPECIAL_PRESETS);
    return raw ? (JSON.parse(raw) as SpecialPreset[]) : [];
  } catch {
    return [];
  }
}

export function saveSpecialPreset(name: string, overrides: SpecialOverride[]): SpecialPreset {
  const all = loadSpecialPresets();
  const trimmed = name.trim() || `Preset ${all.length + 1}`;
  const existing = all.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const preset: SpecialPreset = existing
    ? { ...existing, overrides, createdAt: Date.now() }
    : { id: crypto.randomUUID(), name: trimmed, overrides, createdAt: Date.now() };
  const next = existing ? all.map((p) => (p.id === existing.id ? preset : p)) : [preset, ...all];
  localStorage.setItem(LS_SPECIAL_PRESETS, JSON.stringify(next.slice(0, 30)));
  return preset;
}

export function deleteSpecialPreset(id: string) {
  const next = loadSpecialPresets().filter((p) => p.id !== id);
  localStorage.setItem(LS_SPECIAL_PRESETS, JSON.stringify(next));
}

// -------- IndexedDB for STL ArrayBuffer storage --------

const DB_NAME = "slicerai";
const STORE = "stl";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putStl(id: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(buffer, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getStl(id: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  const result = await new Promise<ArrayBuffer | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}
