import type { MaterialBase, Printer } from "./types";

const LS_PRINTERS = "slicerai.catalog.printers";
const LS_MATERIALS = "slicerai.catalog.materials";
const LS_PROCESS = "slicerai.catalog.process";
const LS_UPDATED = "slicerai.catalog.updatedAt";

/** Known modelId mapping — required for slice_info.config. */
const MODEL_ID: Record<string, string> = {
  "Bambu Lab A1": "N2S",
  "Bambu Lab A1 mini": "N1",
  "Bambu Lab P1S": "C11",
  "Bambu Lab P1P": "C12",
  "Bambu Lab X1 Carbon": "BL-P001",
  "Bambu Lab X1": "BL-P002",
  "Bambu Lab X1E": "BL-P001",
  "Bambu Lab H2D": "O1D",
  "Bambu Lab H2S": "O1S",
};

/** Process preset compatibility — printers without their own presets fall back to these. */
const PROCESS_COMPAT: Record<string, string> = {
  "@BBL P1S": "@BBL X1C",
  "@BBL X1": "@BBL X1C",
};

/** Filament preset compatibility — same fallback map. */
const FILAMENT_COMPAT: Record<string, string> = {
  "@BBL P1S": "@BBL X1C",
  "@BBL X1": "@BBL X1C",
};

export const SEED_PRINTERS: Printer[] = [
  { id: "Bambu Lab A1 0.4 nozzle", displayName: "Bambu Lab A1", printerModel: "Bambu Lab A1", printerVariant: "0.4", modelId: "N2S", bed: [256, 256, 256], suffix: "@BBL A1" },
  { id: "Bambu Lab A1 mini 0.4 nozzle", displayName: "Bambu Lab A1 mini", printerModel: "Bambu Lab A1 mini", printerVariant: "0.4", modelId: "N1", bed: [180, 180, 180], suffix: "@BBL A1M" },
  { id: "Bambu Lab P1S 0.4 nozzle", displayName: "Bambu Lab P1S", printerModel: "Bambu Lab P1S", printerVariant: "0.4", modelId: "C11", bed: [256, 256, 256], suffix: "@BBL P1S" },
  { id: "Bambu Lab P1P 0.4 nozzle", displayName: "Bambu Lab P1P", printerModel: "Bambu Lab P1P", printerVariant: "0.4", modelId: "C12", bed: [256, 256, 256], suffix: "@BBL P1P" },
  { id: "Bambu Lab X1C 0.4 nozzle", displayName: "Bambu Lab X1 Carbon", printerModel: "Bambu Lab X1 Carbon", printerVariant: "0.4", modelId: "BL-P001", bed: [256, 256, 256], suffix: "@BBL X1C" },
  { id: "Bambu Lab X1 0.4 nozzle", displayName: "Bambu Lab X1", printerModel: "Bambu Lab X1", printerVariant: "0.4", modelId: "BL-P002", bed: [256, 256, 256], suffix: "@BBL X1" },
];

export const OPEN_PRINTERS = new Set(["Bambu Lab A1", "Bambu Lab A1 mini", "Bambu Lab P1P"]);

/** Seed process bases so the app works offline (per real Bambu naming). */
const SEED_PROCESS_BASES: string[] = [
  // A1
  "0.08mm Extra Fine @BBL A1",
  "0.12mm Fine @BBL A1",
  "0.16mm Optimal @BBL A1",
  "0.20mm Standard @BBL A1",
  "0.24mm Draft @BBL A1",
  "0.28mm Extra Draft @BBL A1",
  // A1 mini
  "0.08mm Extra Fine @BBL A1M",
  "0.12mm Fine @BBL A1M",
  "0.16mm Optimal @BBL A1M",
  "0.20mm Standard @BBL A1M",
  "0.24mm Draft @BBL A1M",
  "0.28mm Extra Draft @BBL A1M",
  // P1P
  "0.12mm Fine @BBL P1P",
  "0.16mm Optimal @BBL P1P",
  "0.20mm Standard @BBL P1P",
  "0.24mm Draft @BBL P1P",
  "0.28mm Extra Draft @BBL P1P",
  // X1C (also used by P1S and X1 via PROCESS_COMPAT)
  "0.08mm Extra Fine @BBL X1C",
  "0.12mm Fine @BBL X1C",
  "0.16mm Optimal @BBL X1C",
  "0.20mm Standard @BBL X1C",
  "0.24mm Draft @BBL X1C",
  "0.28mm Extra Draft @BBL X1C",
];

/** Seed filament bases (the common Bambu materials for each suffix). */
const SEED_FILAMENT_BASES: string[] = (() => {
  const suffixes = ["@BBL A1", "@BBL A1M", "@BBL P1P", "@BBL X1C"];
  const bases = [
    "Bambu PLA Basic",
    "Bambu PLA Silk",
    "Bambu PETG Basic",
    "Bambu PETG-CF",
    "Bambu PLA-CF",
    "Bambu ABS",
    "Bambu ASA",
    "Bambu TPU 95A",
    "Bambu PA-CF",
  ];
  const out: string[] = [];
  for (const s of suffixes) for (const b of bases) out.push(`${b} ${s}`);
  return out;
})();

export const MATERIALS: MaterialBase[] = [
  { id: "PLA", label: "PLA", filamentId: "GFA00", inheritsBaseName: "Bambu PLA Basic", nozzle: 220, bed: 55, volSpeed: 15, flow: 0.98, fanMin: 60, fanMax: 100, retraction: 0.8, filamentType: "PLA" },
  { id: "PLA_SILK", label: "PLA Silk", filamentId: "GFA05", inheritsBaseName: "Bambu PLA Silk", nozzle: 225, bed: 55, volSpeed: 10, flow: 0.98, fanMin: 40, fanMax: 80, retraction: 0.8, filamentType: "PLA" },
  // PETG anti-teia: subsequent 245°C, initial 250°C
  { id: "PETG", label: "PETG", filamentId: "GFG00", inheritsBaseName: "Bambu PETG Basic", nozzle: 245, nozzleInitial: 250, bed: 70, volSpeed: 8, flow: 0.95, fanMin: 10, fanMax: 40, retraction: 1.0, filamentType: "PETG" },
  { id: "ABS", label: "ABS", filamentId: "GFB00", inheritsBaseName: "Bambu ABS", nozzle: 260, bed: 90, volSpeed: 12, flow: 0.95, fanMin: 0, fanMax: 30, retraction: 0.8, filamentType: "ABS", open: true },
  { id: "ASA", label: "ASA", filamentId: "GFB01", inheritsBaseName: "Bambu ASA", nozzle: 260, bed: 90, volSpeed: 12, flow: 0.95, fanMin: 0, fanMax: 30, retraction: 0.8, filamentType: "ASA", open: true },
  { id: "TPU", label: "TPU", filamentId: "GFU01", inheritsBaseName: "Bambu TPU 95A", nozzle: 230, bed: 40, volSpeed: 3.5, flow: 0.95, fanMin: 40, fanMax: 80, retraction: 0.4, filamentType: "TPU" },
  { id: "PLA_CF", label: "PLA-CF", filamentId: "GFA50", inheritsBaseName: "Bambu PLA-CF", nozzle: 230, bed: 55, volSpeed: 10, flow: 0.98, fanMin: 40, fanMax: 80, retraction: 0.8, filamentType: "PLA-CF" },
  { id: "PETG_CF", label: "PETG-CF", filamentId: "GFG50", inheritsBaseName: "Bambu PETG-CF", nozzle: 260, bed: 70, volSpeed: 10, flow: 0.95, fanMin: 10, fanMax: 40, retraction: 1.0, filamentType: "PETG-CF" },
  { id: "PA", label: "PA (Nylon)", filamentId: "GFN04", inheritsBaseName: "Bambu PA-CF", nozzle: 280, bed: 100, volSpeed: 10, flow: 0.95, fanMin: 0, fanMax: 20, retraction: 1.0, filamentType: "PA", open: true },
];

export function loadPrinters(): Printer[] {
  let fromGithub: Printer[] = [];
  try {
    const raw = localStorage.getItem(LS_PRINTERS);
    if (raw) fromGithub = JSON.parse(raw) as Printer[];
  } catch { fromGithub = []; }
  // Merge — dedupe by printerModel, seed wins (preserves canonical modelId).
  const byModel = new Map<string, Printer>();
  for (const p of fromGithub) byModel.set(p.printerModel, p);
  for (const p of SEED_PRINTERS) byModel.set(p.printerModel, p);
  return [...byModel.values()];
}

export function loadFilamentBases(): string[] {
  let synced: string[] = [];
  try {
    const raw = localStorage.getItem(LS_MATERIALS);
    if (raw) synced = JSON.parse(raw) as string[];
  } catch { synced = []; }
  return Array.from(new Set([...SEED_FILAMENT_BASES, ...synced]));
}

export function loadProcessBases(): string[] {
  let synced: string[] = [];
  try {
    const raw = localStorage.getItem(LS_PROCESS);
    if (raw) synced = JSON.parse(raw) as string[];
  } catch { synced = []; }
  return Array.from(new Set([...SEED_PROCESS_BASES, ...synced]));
}

export function getUpdatedAt(): string | null {
  try { return localStorage.getItem(LS_UPDATED); } catch { return null; }
}

async function fetchAllPages(url: string): Promise<Array<{ name: string; type: string }>> {
  const out: Array<{ name: string; type: string }> = [];
  for (let page = 1; page < 20; page++) {
    const r = await fetch(`${url}?per_page=100&page=${page}`, { headers: { Accept: "application/vnd.github+json" } });
    if (r.status === 403) throw new Error("Rate limit do GitHub. Tente novamente em alguns minutos.");
    if (!r.ok) throw new Error(`GitHub retornou ${r.status}`);
    const data = (await r.json()) as Array<{ name: string; type: string }>;
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

function inferBedFromName(name: string): [number, number, number] {
  const n = name.toLowerCase();
  if (n.includes("mini")) return [180, 180, 180];
  return [256, 256, 256];
}

function suffixFromName(name: string): string {
  const cleaned = name.replace(/^Bambu Lab\s+/i, "").replace(/\s+\d+\.\d+\s+nozzle$/i, "");
  return `@BBL ${cleaned}`;
}

export async function syncGithub(): Promise<{ printers: number; filaments: number; processes: number }> {
  const base = "https://api.github.com/repos/bambulab/BambuStudio/contents/resources/profiles/BBL";
  const [machines, filaments, processes] = await Promise.all([
    fetchAllPages(`${base}/machine`),
    fetchAllPages(`${base}/filament`),
    fetchAllPages(`${base}/process`),
  ]);

  const byModel = new Map<string, Printer>();
  for (const m of machines) {
    if (m.type !== "file" || !m.name.endsWith(".json")) continue;
    if (/template/i.test(m.name)) continue;
    // ONLY the 0.4 nozzle variant — one file per model.
    if (!/0\.4\s+nozzle\.json$/i.test(m.name)) continue;
    const id = m.name.replace(/\.json$/i, "");
    const displayName = id.replace(/\s+\d+\.\d+\s+nozzle$/i, "");
    if (byModel.has(displayName)) continue;
    byModel.set(displayName, {
      id,
      displayName,
      printerModel: displayName,
      printerVariant: "0.4",
      modelId: MODEL_ID[displayName] ?? "",
      bed: inferBedFromName(id),
      suffix: suffixFromName(id),
      fromGithub: true,
    });
  }
  const printers = [...byModel.values()];

  const filamentNames = filaments
    .filter((f) => f.type === "file" && f.name.endsWith(".json") && !/template/i.test(f.name))
    .map((f) => f.name.replace(/\.json$/i, ""));
  const processNames = processes
    .filter((f) => f.type === "file" && f.name.endsWith(".json") && !/template/i.test(f.name))
    .map((f) => f.name.replace(/\.json$/i, ""));

  try {
    localStorage.setItem(LS_PRINTERS, JSON.stringify(printers));
    localStorage.setItem(LS_MATERIALS, JSON.stringify(filamentNames));
    localStorage.setItem(LS_PROCESS, JSON.stringify(processNames));
    localStorage.setItem(LS_UPDATED, new Date().toISOString());
  } catch {
    // storage may be full — data still returned for this session
  }
  return { printers: printers.length, filaments: filamentNames.length, processes: processNames.length };
}

function escSuffix(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find a real process preset that Bambu Studio will actually recognize. */
export function findProcessInherits(printer: Printer, layerMm: number, _filamentBases: string[]): string {
  void _filamentBases;
  const processes = loadProcessBases();
  const layer = layerMm.toFixed(2);

  const tryFor = (suffix: string): string | null => {
    const esc = escSuffix(suffix);
    // 1) exact layer + suffix (any tier: Standard/Optimal/Fine/Draft)
    const byLayer = new RegExp(`^${layer}mm .+ ${esc}$`);
    for (const p of processes) if (byLayer.test(p)) return p;
    // 2) 0.20mm Standard fallback for this suffix
    const standard = `0.20mm Standard ${suffix}`;
    if (processes.includes(standard)) return standard;
    // 3) any base ending in this suffix — pick the numerically closest layer
    const candidates = processes.filter((p) => p.endsWith(` ${suffix}`));
    if (candidates.length > 0) {
      let best = candidates[0];
      let bestDiff = Infinity;
      for (const c of candidates) {
        const m = c.match(/^(\d+\.\d+)mm/);
        if (!m) continue;
        const diff = Math.abs(parseFloat(m[1]) - layerMm);
        if (diff < bestDiff) { bestDiff = diff; best = c; }
      }
      return best;
    }
    return null;
  };

  const direct = tryFor(printer.suffix);
  if (direct) return direct;

  const fallbackSuffix = PROCESS_COMPAT[printer.suffix];
  if (fallbackSuffix) {
    const via = tryFor(fallbackSuffix);
    if (via) return via;
  }
  throw new Error(
    `Não encontrei o preset de processo base para ${printer.displayName}. Clique em "Atualizar com GitHub".`,
  );
}

export function findFilamentInherits(printer: Printer, material: MaterialBase): string {
  const bases = loadFilamentBases();

  const tryFor = (suffix: string): string | null => {
    const exact = `${material.inheritsBaseName} ${suffix}`;
    if (bases.includes(exact)) return exact;
    const partial = bases.find((b) => b.startsWith(material.inheritsBaseName) && b.endsWith(` ${suffix}`));
    return partial ?? null;
  };

  const direct = tryFor(printer.suffix);
  if (direct) return direct;

  const fallbackSuffix = FILAMENT_COMPAT[printer.suffix];
  if (fallbackSuffix) {
    const via = tryFor(fallbackSuffix);
    if (via) return via;
  }
  throw new Error(
    `Não encontrei o preset de filamento "${material.inheritsBaseName}" para ${printer.displayName}. Clique em "Atualizar com GitHub".`,
  );
}

/** Used by validation to confirm a resolved inherits is real. */
export function isKnownProcess(name: string): boolean {
  return loadProcessBases().includes(name);
}
export function isKnownFilament(name: string): boolean {
  return loadFilamentBases().includes(name);
}
