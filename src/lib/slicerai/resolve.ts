// Silent, resilient preset resolver for Bambu profiles.
//
// Single source of truth: the master BBL.json in the Bambu Studio repo (served
// via raw.githubusercontent.com, so NO rate limit and NO auth). We cache the
// whole index in IndexedDB + localStorage (small enough) so the app boots
// offline with the last-known-good data.

const DB_NAME = "slicerai-presets";
const STORE = "presets";
const DB_VERSION = 1;
const MASTER_KEY = "__master__";
const LS_MASTER = "slicerai.master.v1";
const LS_MASTER_UPDATED = "slicerai.master.updatedAt";
const MASTER_URL =
  "https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL.json";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export type PresetFolder = "machine" | "process" | "filament";

export interface MasterEntry {
  name: string;
  sub_path: string;
}
export interface MasterIndex {
  machine_list: MasterEntry[];
  process_list: MasterEntry[];
  filament_list: MasterEntry[];
}

// ----- IndexedDB helpers -----
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

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const res = await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res;
  } catch {
    return null;
  }
}

async function idbPut(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

// ----- Memory caches -----
const memCache = new Map<string, Record<string, unknown>>();
let masterMem: MasterIndex | null = null;
let masterUpdatedAtMem: string | null = null;
let inflightSync: Promise<MasterIndex | null> | null = null;

// Fast synchronous seed of memory caches from localStorage (client-only).
function primeFromLocalStorage() {
  if (masterMem) return;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_MASTER);
    if (raw) masterMem = JSON.parse(raw) as MasterIndex;
    masterUpdatedAtMem = localStorage.getItem(LS_MASTER_UPDATED);
  } catch {
    /* ignore */
  }
}

/** Synchronous getter — returns whatever's already in memory/localStorage. */
export function getMasterIndexSync(): MasterIndex | null {
  primeFromLocalStorage();
  return masterMem;
}

export function getMasterUpdatedAtSync(): string | null {
  primeFromLocalStorage();
  return masterUpdatedAtMem;
}

/** Async getter — falls back to IndexedDB when localStorage isn't primed. */
export async function loadMasterIndex(): Promise<MasterIndex | null> {
  primeFromLocalStorage();
  if (masterMem) return masterMem;
  const cached = await idbGet<{ data: MasterIndex; updatedAt: string }>(MASTER_KEY);
  if (cached?.data) {
    masterMem = cached.data;
    masterUpdatedAtMem = cached.updatedAt;
    try {
      localStorage.setItem(LS_MASTER, JSON.stringify(cached.data));
      localStorage.setItem(LS_MASTER_UPDATED, cached.updatedAt);
    } catch {
      /* ignore */
    }
    return masterMem;
  }
  return null;
}

/**
 * Fetches the master index from raw.githubusercontent.com. NEVER throws —
 * failures are swallowed and the previous cache is preserved.
 *
 * @param opts.force skip the 6h freshness check.
 * @returns the freshly fetched (or previously cached) master, or null.
 */
export async function syncMasterIndex(opts: { force?: boolean } = {}): Promise<MasterIndex | null> {
  if (inflightSync) return inflightSync;
  inflightSync = (async () => {
    try {
      await loadMasterIndex();
      const now = Date.now();
      if (!opts.force && masterMem && masterUpdatedAtMem) {
        const ageMs = now - new Date(masterUpdatedAtMem).getTime();
        if (Number.isFinite(ageMs) && ageMs < SIX_HOURS_MS) {
          return masterMem;
        }
      }
      const r = await fetch(MASTER_URL, { cache: "no-cache" });
      if (!r.ok) return masterMem;
      const data = (await r.json()) as MasterIndex;
      if (!data || !Array.isArray(data.machine_list) || !Array.isArray(data.filament_list)) return masterMem;
      const updatedAt = new Date().toISOString();
      masterMem = data;
      masterUpdatedAtMem = updatedAt;
      try {
        localStorage.setItem(LS_MASTER, JSON.stringify(data));
        localStorage.setItem(LS_MASTER_UPDATED, updatedAt);
      } catch {
        /* quota — memory still has it */
      }
      // Fire-and-forget IDB copy for warm boot when localStorage is empty.
      void idbPut(MASTER_KEY, { data, updatedAt });
      return masterMem;
    } catch {
      return masterMem;
    } finally {
      inflightSync = null;
    }
  })();
  return inflightSync;
}

// ----- Preset JSON fetch (uses master sub_path when available) -----

function findSubPath(folder: PresetFolder, name: string): string | null {
  primeFromLocalStorage();
  if (!masterMem) return null;
  const list =
    folder === "machine" ? masterMem.machine_list
    : folder === "process" ? masterMem.process_list
    : masterMem.filament_list;
  const hit = list.find((e) => e.name === name);
  return hit?.sub_path ?? null;
}

function presetUrl(folder: PresetFolder, name: string): string {
  const sub = findSubPath(folder, name);
  const path = sub ?? `${folder}/${name}.json`;
  const parts = path.split("/").map((p) => encodeURIComponent(p)).join("/");
  return `https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/${parts}`;
}

export async function getPresetJson(
  folder: PresetFolder,
  name: string,
): Promise<Record<string, unknown>> {
  const key = `${folder}/${name}`;
  const mem = memCache.get(key);
  if (mem) return mem;
  const cached = await idbGet<Record<string, unknown>>(key);
  if (cached) {
    memCache.set(key, cached);
    return cached;
  }
  const r = await fetch(presetUrl(folder, name));
  if (!r.ok) {
    throw new Error(`Preset ausente no cache: ${folder}/${name}. Aguarde a próxima sincronização.`);
  }
  const data = (await r.json()) as Record<string, unknown>;
  memCache.set(key, data);
  void idbPut(key, data);
  return data;
}

export async function resolveChain(
  folder: PresetFolder,
  leafName: string,
): Promise<Record<string, unknown>> {
  const leaf = await getPresetJson(folder, leafName);
  const inherits = leaf.inherits;
  if (typeof inherits === "string" && inherits.length > 0) {
    const parent = await resolveChain(folder, inherits);
    const merged: Record<string, unknown> = { ...parent };
    for (const [k, v] of Object.entries(leaf)) {
      if (k === "inherits") continue;
      merged[k] = v;
    }
    return merged;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(leaf)) {
    if (k === "inherits") continue;
    out[k] = v;
  }
  return out;
}
