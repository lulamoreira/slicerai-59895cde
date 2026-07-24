// Resolve real Bambu presets from GitHub and cache them locally.
// A .3mf project must ship a COMPLETE project_settings.config; sparse configs
// cause Bambu Studio to silently revert to defaults.

const DB_NAME = "slicerai-presets";
const STORE = "presets";
const DB_VERSION = 1;

export type PresetFolder = "machine" | "process" | "filament";

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

async function getCached(key: string): Promise<Record<string, unknown> | null> {
  try {
    const db = await openDb();
    const res = await new Promise<Record<string, unknown> | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as Record<string, unknown> | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res;
  } catch {
    return null;
  }
}

async function putCached(key: string, value: Record<string, unknown>): Promise<void> {
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
    /* ignore cache write failure */
  }
}

const memCache = new Map<string, Record<string, unknown>>();

export async function getPresetJson(
  folder: PresetFolder,
  name: string,
): Promise<Record<string, unknown>> {
  const key = `${folder}/${name}`;
  const mem = memCache.get(key);
  if (mem) return mem;
  const cached = await getCached(key);
  if (cached) {
    memCache.set(key, cached);
    return cached;
  }
  const url = `https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/${folder}/${encodeURIComponent(name)}.json`;
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    throw new Error(
      "Não consegui buscar os presets base do GitHub. Conecte-se à internet e clique em \"Aprender com o GitHub\" uma vez.",
    );
  }
  if (!r.ok) {
    throw new Error(
      `Não consegui buscar o preset base "${folder}/${name}" no GitHub (HTTP ${r.status}). Conecte-se à internet e clique em "Aprender com o GitHub" uma vez.`,
    );
  }
  const data = (await r.json()) as Record<string, unknown>;
  memCache.set(key, data);
  await putCached(key, data);
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
