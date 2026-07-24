import type { MaterialBase, Printer } from "./types";

const LS_PRINTERS = "slicerai.catalog.printers";
const LS_MATERIALS = "slicerai.catalog.materials";
const LS_PROCESS = "slicerai.catalog.process";
const LS_UPDATED = "slicerai.catalog.updatedAt";

export const SEED_PRINTERS: Printer[] = [
  { id: "Bambu Lab A1 0.4 nozzle", displayName: "Bambu Lab A1", printerModel: "Bambu Lab A1", printerVariant: "0.4", modelId: "N2S", bed: [256, 256, 256], suffix: "@BBL A1" },
  { id: "Bambu Lab A1 mini 0.4 nozzle", displayName: "Bambu Lab A1 mini", printerModel: "Bambu Lab A1 mini", printerVariant: "0.4", modelId: "N1", bed: [180, 180, 180], suffix: "@BBL A1M" },
  { id: "Bambu Lab P1S 0.4 nozzle", displayName: "Bambu Lab P1S", printerModel: "Bambu Lab P1S", printerVariant: "0.4", modelId: "C11", bed: [256, 256, 256], suffix: "@BBL P1S" },
  { id: "Bambu Lab P1P 0.4 nozzle", displayName: "Bambu Lab P1P", printerModel: "Bambu Lab P1P", printerVariant: "0.4", modelId: "C12", bed: [256, 256, 256], suffix: "@BBL P1P" },
  { id: "Bambu Lab X1C 0.4 nozzle", displayName: "Bambu Lab X1 Carbon", printerModel: "Bambu Lab X1 Carbon", printerVariant: "0.4", modelId: "BL-P001", bed: [256, 256, 256], suffix: "@BBL X1C" },
  { id: "Bambu Lab X1 0.4 nozzle", displayName: "Bambu Lab X1", printerModel: "Bambu Lab X1", printerVariant: "0.4", modelId: "BL-P002", bed: [256, 256, 256], suffix: "@BBL X1" },
];

export const OPEN_PRINTERS = new Set(["Bambu Lab A1", "Bambu Lab A1 mini", "Bambu Lab P1P"]);

export const MATERIALS: MaterialBase[] = [
  { id: "PLA", label: "PLA", filamentId: "GFA00", inheritsBaseName: "Bambu PLA Basic", nozzle: 220, bed: 55, volSpeed: 15, flow: 0.98, fanMin: 60, fanMax: 100, retraction: 0.8, filamentType: "PLA" },
  { id: "PLA_SILK", label: "PLA Silk", filamentId: "GFA05", inheritsBaseName: "Bambu PLA Silk", nozzle: 225, bed: 55, volSpeed: 10, flow: 0.98, fanMin: 40, fanMax: 80, retraction: 0.8, filamentType: "PLA" },
  { id: "PETG", label: "PETG", filamentId: "GFG00", inheritsBaseName: "Bambu PETG Basic", nozzle: 250, bed: 70, volSpeed: 8, flow: 0.95, fanMin: 10, fanMax: 40, retraction: 1.0, filamentType: "PETG" },
  { id: "ABS", label: "ABS", filamentId: "GFB00", inheritsBaseName: "Bambu ABS", nozzle: 260, bed: 90, volSpeed: 12, flow: 0.95, fanMin: 0, fanMax: 30, retraction: 0.8, filamentType: "ABS", open: true },
  { id: "ASA", label: "ASA", filamentId: "GFB01", inheritsBaseName: "Bambu ASA", nozzle: 260, bed: 90, volSpeed: 12, flow: 0.95, fanMin: 0, fanMax: 30, retraction: 0.8, filamentType: "ASA", open: true },
  { id: "TPU", label: "TPU", filamentId: "GFU01", inheritsBaseName: "Bambu TPU 95A", nozzle: 230, bed: 40, volSpeed: 3.5, flow: 0.95, fanMin: 40, fanMax: 80, retraction: 0.4, filamentType: "TPU" },
  { id: "PLA_CF", label: "PLA-CF", filamentId: "GFA50", inheritsBaseName: "Bambu PLA-CF", nozzle: 230, bed: 55, volSpeed: 10, flow: 0.98, fanMin: 40, fanMax: 80, retraction: 0.8, filamentType: "PLA-CF" },
  { id: "PETG_CF", label: "PETG-CF", filamentId: "GFG50", inheritsBaseName: "Bambu PETG-CF", nozzle: 260, bed: 70, volSpeed: 10, flow: 0.95, fanMin: 10, fanMax: 40, retraction: 1.0, filamentType: "PETG-CF" },
  { id: "PA", label: "PA (Nylon)", filamentId: "GFN04", inheritsBaseName: "Bambu PA-CF", nozzle: 280, bed: 100, volSpeed: 10, flow: 0.95, fanMin: 0, fanMax: 20, retraction: 1.0, filamentType: "PA", open: true },
];

export function loadPrinters(): Printer[] {
  try {
    const raw = localStorage.getItem(LS_PRINTERS);
    if (!raw) return SEED_PRINTERS;
    const parsed = JSON.parse(raw) as Printer[];
    // merge seed with github by id (seed wins if same id)
    const map = new Map<string, Printer>();
    for (const p of parsed) map.set(p.id, p);
    for (const p of SEED_PRINTERS) map.set(p.id, p);
    return [...map.values()];
  } catch {
    return SEED_PRINTERS;
  }
}

export function loadFilamentBases(): string[] {
  try {
    const raw = localStorage.getItem(LS_MATERIALS);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function loadProcessBases(): string[] {
  try {
    const raw = localStorage.getItem(LS_PROCESS);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function getUpdatedAt(): string | null {
  return localStorage.getItem(LS_UPDATED);
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
  // e.g. "Bambu Lab A1 0.4 nozzle" -> "@BBL A1"
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

  const printers: Printer[] = [];
  for (const m of machines) {
    if (m.type !== "file" || !m.name.endsWith(".json")) continue;
    if (/template/i.test(m.name)) continue;
    if (!/nozzle\.json$/i.test(m.name)) continue;
    const id = m.name.replace(/\.json$/i, "");
    const displayName = id.replace(/\s+\d+\.\d+\s+nozzle$/i, "");
    const variantMatch = id.match(/(\d+\.\d+)\s+nozzle/i);
    printers.push({
      id,
      displayName,
      printerModel: displayName,
      printerVariant: variantMatch?.[1] ?? "0.4",
      modelId: "",
      bed: inferBedFromName(id),
      suffix: suffixFromName(id),
      fromGithub: true,
    });
  }

  const filamentNames = filaments
    .filter((f) => f.type === "file" && f.name.endsWith(".json") && !/template/i.test(f.name))
    .map((f) => f.name.replace(/\.json$/i, ""));
  const processNames = processes
    .filter((f) => f.type === "file" && f.name.endsWith(".json") && !/template/i.test(f.name))
    .map((f) => f.name.replace(/\.json$/i, ""));

  localStorage.setItem(LS_PRINTERS, JSON.stringify(printers));
  localStorage.setItem(LS_MATERIALS, JSON.stringify(filamentNames));
  localStorage.setItem(LS_PROCESS, JSON.stringify(processNames));
  localStorage.setItem(LS_UPDATED, new Date().toISOString());
  return { printers: printers.length, filaments: filamentNames.length, processes: processNames.length };
}

export function findProcessInherits(printer: Printer, layerMm: number, filamentBases: string[]): string {
  // Try "0.XXmm Standard @BBL <suffix>"
  const layer = layerMm.toFixed(2);
  const suffix = printer.suffix;
  const candidates = [
    `${layer}mm Standard ${suffix}`,
    `${layer}mm Standard @BBL ${printer.printerModel.replace(/^Bambu Lab\s+/i, "")}`,
    `0.20mm Standard ${suffix}`,
  ];
  const processes = loadProcessBases();
  for (const c of candidates) if (processes.includes(c)) return c;
  // fallback
  return `${layer}mm Standard ${suffix}`;
}

export function findFilamentInherits(printer: Printer, material: MaterialBase): string {
  // Try "<base> @BBL <suffix>"
  const cand = `${material.inheritsBaseName} ${printer.suffix}`;
  const bases = loadFilamentBases();
  if (bases.length === 0) return cand; // no sync — trust convention
  if (bases.includes(cand)) return cand;
  // try without suffix
  const partial = bases.find((b) => b.startsWith(material.inheritsBaseName) && b.includes(printer.suffix));
  return partial ?? cand;
}
