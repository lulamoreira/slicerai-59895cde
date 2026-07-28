// Dynamic catalog derived from the master BBL.json index.
//
// - Printers: every 0.X-nozzle entry in machine_list (no hard-coded list).
// - Suffix ("@BBL <code>"): chosen by counting filament_list matches per
//   candidate abbreviation — that self-corrects to whatever the repo uses.
// - Materials: derived per-printer from filament_list (filtered by suffix).
// - Processes: matched from process_list by layer + resolved suffix.

import type { MaterialBase, Printer, Vec3 } from "./types";
import {
  getMasterIndexSync,
  getMasterUpdatedAtSync,
  syncMasterIndex,
  type MasterEntry,
  type MasterIndex,
} from "./resolve";

// -------- Constants --------

/** Known modelId — used only for slice_info; Bambu keys off printer_settings_id. */
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

/** Fallback suffix map for printers with no dedicated presets yet. */
const SUFFIX_COMPAT: Record<string, string> = {
  "@BBL P1S": "@BBL X1C",
  "@BBL X1": "@BBL X1C",
};

/** Enclosure-open models — used to warn about technical materials. */
export const OPEN_PRINTERS = new Set(["Bambu Lab A1", "Bambu Lab A1 mini", "Bambu Lab P1P"]);

// -------- Seed (minimal offline fallback) --------

export const SEED_PRINTERS: Printer[] = [
  {
    id: "Bambu Lab A1 0.4 nozzle",
    displayName: "Bambu Lab A1",
    printerModel: "Bambu Lab A1",
    printerVariant: "0.4",
    modelId: "N2S",
    bed: [256, 256, 256],
    suffix: "@BBL A1",
  },
  {
    id: "Bambu Lab X1 Carbon 0.4 nozzle",
    displayName: "Bambu Lab X1 Carbon",
    printerModel: "Bambu Lab X1 Carbon",
    printerVariant: "0.4",
    modelId: "BL-P001",
    bed: [256, 256, 256],
    suffix: "@BBL X1C",
  },
];

// -------- Suffix + printer derivation --------

function inferBed(name: string): Vec3 {
  return /mini/i.test(name) ? [180, 180, 180] : [256, 256, 256];
}

function extractNozzle(name: string): string {
  const m = name.match(/(\d\.\d)\s*nozzle$/i);
  return m ? m[1] : "0.4";
}

function stripPrefixNozzle(name: string): string {
  return name
    .replace(/^Bambu Lab\s+/i, "")
    .replace(/\s*\d\.\d\s*nozzle$/i, "")
    .trim();
}

/** Candidate suffix codes for a machine name, from most literal to most abbreviated.
 *  When nozzle ≠ 0.4, includes the "<code> <nozzle> nozzle" variants used by non-default bicos. */
function suffixCandidates(machineName: string, nozzle?: string): string[] {
  const core = stripPrefixNozzle(machineName);
  const noz = nozzle ?? extractNozzle(machineName);
  const isDefault = noz === "0.4";
  const bases = new Set<string>();
  bases.add(core);
  bases.add(core.replace(/\s+mini$/i, "M").replace(/\s+/g, ""));
  const words = core.split(/\s+/);
  if (words.length > 1) {
    const initials =
      words[0] +
      words
        .slice(1)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");
    bases.add(initials);
    bases.add(words[0]);
  }
  const baseArr = Array.from(bases).filter(Boolean);
  if (isDefault) return baseArr;
  // For non-0.4 nozzles, presets add " <nozzle> nozzle" to the suffix.
  const withNozzle = baseArr.map((b) => `${b} ${noz} nozzle`);
  return [...withNozzle, ...baseArr];
}

/** Chooses the suffix whose "@BBL <code>" has the MOST filament entries. */
function pickSuffix(machineName: string, filamentNames: string[], nozzle?: string): string {
  const cands = suffixCandidates(machineName, nozzle);
  let best = cands[0] ?? stripPrefixNozzle(machineName);
  let bestCount = -1;
  for (const c of cands) {
    const suf = `@BBL ${c}`;
    let n = 0;
    for (const f of filamentNames) if (f.endsWith(` ${suf}`)) n++;
    if (n > bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return `@BBL ${best}`;
}

function normalizeMachineEntries(index: MasterIndex): MasterEntry[] {
  const out: MasterEntry[] = [];
  const seen = new Set<string>();
  for (const m of index.machine_list) {
    if (!m?.name) continue;
    if (/template/i.test(m.name)) continue;
    if (!/0\.\d+\s+nozzle$/i.test(m.name)) continue;
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    out.push(m);
  }
  return out;
}

function buildPrintersFromMaster(index: MasterIndex): Printer[] {
  const filamentNames = index.filament_list.map((f) => f.name);
  const machines = normalizeMachineEntries(index);
  const printers: Printer[] = [];
  for (const m of machines) {
    const displayName = stripPrefixNozzle(m.name);
    const variant = extractNozzle(m.name);
    const suffix = pickSuffix(m.name, filamentNames, variant);
    printers.push({
      id: m.name,
      displayName,
      printerModel: displayName,
      printerVariant: variant,
      modelId: MODEL_ID[displayName] ?? "",
      bed: inferBed(m.name),
      suffix,
      fromGithub: true,
    });
  }
  printers.sort(
    (a, b) =>
      a.displayName.localeCompare(b.displayName) ||
      parseFloat(a.printerVariant) - parseFloat(b.printerVariant),
  );
  return printers;
}

/** Merge master-derived printers with the seed (all nozzle variants exposed). */
export function loadPrinters(): Printer[] {
  const index = getMasterIndexSync();
  if (!index) return SEED_PRINTERS;
  const derived = buildPrintersFromMaster(index);
  const byId = new Map<string, Printer>();
  for (const p of derived) byId.set(p.id, p);
  for (const s of SEED_PRINTERS) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  return Array.from(byId.values()).sort(
    (a, b) =>
      a.displayName.localeCompare(b.displayName) ||
      parseFloat(a.printerVariant) - parseFloat(b.printerVariant),
  );
}

/** Unique printer models (grouped) — used by the "modelo" dropdown. */
export function listPrinterModels(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of loadPrinters()) {
    if (!seen.has(p.printerModel)) {
      seen.add(p.printerModel);
      out.push(p.printerModel);
    }
  }
  return out;
}

/** Nozzle diameters available for a given model (from BBL.json machine_list). */
export function listNozzlesForModel(model: string): string[] {
  const nozzles = loadPrinters()
    .filter((p) => p.printerModel === model)
    .map((p) => p.printerVariant);
  return Array.from(new Set(nozzles)).sort((a, b) => parseFloat(a) - parseFloat(b));
}

export function findPrinter(model: string, nozzle: string): Printer | null {
  return (
    loadPrinters().find((p) => p.printerModel === model && p.printerVariant === nozzle) ?? null
  );
}

export function getUpdatedAt(): string | null {
  return getMasterUpdatedAtSync();
}

// -------- Material derivation --------

const TYPE_PATTERNS: Array<{ re: RegExp; type: string; id: string; label: string }> = [
  { re: /PETG[- ]?CF/i, type: "PETG-CF", id: "PETG_CF", label: "PETG-CF" },
  { re: /PETG[- ]?HF/i, type: "PETG", id: "PETG_HF", label: "PETG HF" },
  { re: /PETG/i, type: "PETG", id: "PETG", label: "PETG" },
  { re: /PLA[- ]?CF/i, type: "PLA-CF", id: "PLA_CF", label: "PLA-CF" },
  { re: /PLA[- ]?Silk/i, type: "PLA", id: "PLA_SILK", label: "PLA Silk" },
  { re: /PLA[- ]?Aero/i, type: "PLA", id: "PLA_AERO", label: "PLA Aero" },
  { re: /PLA[- ]?Wood/i, type: "PLA", id: "PLA_WOOD", label: "PLA Wood" },
  { re: /PLA[- ]?Matte/i, type: "PLA", id: "PLA_MATTE", label: "PLA Matte" },
  { re: /PLA[- ]?Marble/i, type: "PLA", id: "PLA_MARBLE", label: "PLA Marble" },
  { re: /PLA[- ]?Metal/i, type: "PLA", id: "PLA_METAL", label: "PLA Metal" },
  { re: /PLA[- ]?Galaxy/i, type: "PLA", id: "PLA_GALAXY", label: "PLA Galaxy" },
  { re: /PLA[- ]?Glow/i, type: "PLA", id: "PLA_GLOW", label: "PLA Glow" },
  { re: /PLA[- ]?Sparkle/i, type: "PLA", id: "PLA_SPARKLE", label: "PLA Sparkle" },
  { re: /PLA/i, type: "PLA", id: "PLA", label: "PLA" },
  { re: /ABS[- ]?GF/i, type: "ABS", id: "ABS_GF", label: "ABS-GF" },
  { re: /ABS/i, type: "ABS", id: "ABS", label: "ABS" },
  { re: /ASA[- ]?CF/i, type: "ASA", id: "ASA_CF", label: "ASA-CF" },
  { re: /ASA/i, type: "ASA", id: "ASA", label: "ASA" },
  { re: /TPU/i, type: "TPU", id: "TPU", label: "TPU" },
  { re: /PA[- ]?CF/i, type: "PA-CF", id: "PA_CF", label: "PA-CF" },
  { re: /PA[- ]?HT/i, type: "PA", id: "PA_HT", label: "PA-HT" },
  { re: /PA/i, type: "PA", id: "PA", label: "PA (Nylon)" },
  { re: /PC/i, type: "PC", id: "PC", label: "PC" },
  { re: /PPS/i, type: "PPS", id: "PPS", label: "PPS" },
  { re: /PPA/i, type: "PPA", id: "PPA", label: "PPA" },
  { re: /PEEK/i, type: "PEEK", id: "PEEK", label: "PEEK" },
];

const TYPE_DEFAULTS: Record<
  string,
  {
    nozzle: number;
    nozzleInitial?: number;
    bed: number;
    volSpeed: number;
    flow: number;
    fanMin: number;
    fanMax: number;
    retraction: number;
    open?: boolean;
  }
> = {
  PLA: { nozzle: 220, bed: 55, volSpeed: 15, flow: 0.98, fanMin: 60, fanMax: 100, retraction: 0.8 },
  "PLA-CF": {
    nozzle: 230,
    bed: 55,
    volSpeed: 10,
    flow: 0.98,
    fanMin: 40,
    fanMax: 80,
    retraction: 0.8,
  },
  // PETG anti-teia: 245°C subsequente, 250°C 1ª camada
  PETG: {
    nozzle: 245,
    nozzleInitial: 250,
    bed: 70,
    volSpeed: 8,
    flow: 0.95,
    fanMin: 10,
    fanMax: 40,
    retraction: 1.0,
  },
  "PETG-CF": {
    nozzle: 260,
    bed: 70,
    volSpeed: 10,
    flow: 0.95,
    fanMin: 10,
    fanMax: 40,
    retraction: 1.0,
  },
  ABS: {
    nozzle: 260,
    bed: 90,
    volSpeed: 12,
    flow: 0.95,
    fanMin: 0,
    fanMax: 30,
    retraction: 0.8,
    open: true,
  },
  ASA: {
    nozzle: 260,
    bed: 90,
    volSpeed: 12,
    flow: 0.95,
    fanMin: 0,
    fanMax: 30,
    retraction: 0.8,
    open: true,
  },
  TPU: { nozzle: 230, bed: 40, volSpeed: 3.5, flow: 0.95, fanMin: 40, fanMax: 80, retraction: 0.4 },
  PA: {
    nozzle: 280,
    bed: 100,
    volSpeed: 10,
    flow: 0.95,
    fanMin: 0,
    fanMax: 20,
    retraction: 1.0,
    open: true,
  },
  "PA-CF": {
    nozzle: 290,
    bed: 100,
    volSpeed: 10,
    flow: 0.95,
    fanMin: 0,
    fanMax: 20,
    retraction: 1.0,
    open: true,
  },
  PC: {
    nozzle: 280,
    bed: 100,
    volSpeed: 10,
    flow: 0.95,
    fanMin: 0,
    fanMax: 20,
    retraction: 1.0,
    open: true,
  },
  PPS: {
    nozzle: 320,
    bed: 110,
    volSpeed: 8,
    flow: 0.95,
    fanMin: 0,
    fanMax: 20,
    retraction: 1.0,
    open: true,
  },
  PPA: {
    nozzle: 300,
    bed: 100,
    volSpeed: 10,
    flow: 0.95,
    fanMin: 0,
    fanMax: 20,
    retraction: 1.0,
    open: true,
  },
  PEEK: {
    nozzle: 380,
    bed: 130,
    volSpeed: 6,
    flow: 0.95,
    fanMin: 0,
    fanMax: 10,
    retraction: 1.0,
    open: true,
  },
};

function detectType(name: string): { type: string; idBase: string; labelBase: string } {
  for (const p of TYPE_PATTERNS)
    if (p.re.test(name)) return { type: p.type, idBase: p.id, labelBase: p.label };
  return { type: "PLA", idBase: "PLA", labelBase: "PLA" };
}

function cleanLabel(name: string, suffix: string): string {
  return name
    .replace(new RegExp(`\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "")
    .replace(/\s*@base\s*$/i, "")
    .replace(/^Bambu\s+/i, "")
    .trim();
}

/** Build a MaterialBase from a filament leaf name (e.g. "Bambu PETG HF @BBL A1"). */
export function buildMaterialFromName(name: string, suffix: string): MaterialBase {
  const detected = detectType(name);
  const defaults = TYPE_DEFAULTS[detected.type] ?? TYPE_DEFAULTS.PLA;
  const highFlow = /\bHF\b|High\s*Speed|High\s*Flow/i.test(name);
  return {
    id: name, // use full leaf name — guaranteed unique per printer suffix
    label: cleanLabel(name, suffix),
    filamentId: "GFA00",
    inheritsBaseName: name,
    nozzle: defaults.nozzle,
    nozzleInitial: defaults.nozzleInitial,
    bed: defaults.bed,
    volSpeed: defaults.volSpeed,
    flow: defaults.flow,
    fanMin: defaults.fanMin,
    fanMax: defaults.fanMax,
    retraction: defaults.retraction,
    filamentType: detected.type,
    open: defaults.open,
    highFlow,
  };
}

function isBaseTemplate(name: string): boolean {
  return /@base\b/i.test(name) || /template/i.test(name) || /^fdm_/i.test(name);
}

/** Sort helper: keep the Basic/PLA/PETG family first, then technical, then exotic. */
function materialSortKey(m: MaterialBase): string {
  const family = /PLA/i.test(m.label)
    ? "1"
    : /PETG/i.test(m.label)
      ? "2"
      : /ABS|ASA/i.test(m.label)
        ? "3"
        : /TPU/i.test(m.label)
          ? "4"
          : /PA|Nylon/i.test(m.label)
            ? "5"
            : "9";
  return family + m.label.toLowerCase();
}

/** Dynamic material list for a given printer, from the master filament index. */
export function listMaterialsForPrinter(printer: Printer): MaterialBase[] {
  const index = getMasterIndexSync();
  if (!index) return [];
  const suffix = resolveEffectiveSuffix(printer, index.filament_list);
  const out = new Map<string, MaterialBase>();
  const familiesPresent = new Set<string>();
  for (const f of index.filament_list) {
    if (!f?.name) continue;
    if (isBaseTemplate(f.name)) continue;
    if (!f.name.endsWith(` ${suffix}`)) continue;
    const mat = buildMaterialFromName(f.name, suffix);
    familiesPresent.add(mat.filamentType);
    // Prefer non-HF over HF when same label (rare collision).
    const existing = out.get(mat.label);
    if (!existing || (existing.highFlow && !mat.highFlow)) out.set(mat.label, mat);
  }

  // Fallback: include machine-agnostic "Generic <TYPE> @base" for families that
  // don't have any printer-specific preset — so any pure material stays reachable.
  for (const f of index.filament_list) {
    if (!f?.name) continue;
    if (!/^Generic\s.+\s@base$/i.test(f.name)) continue;
    const mat = buildMaterialFromName(f.name, suffix);
    if (familiesPresent.has(mat.filamentType)) continue;
    if (out.has(mat.label)) continue;
    out.set(mat.label, mat);
  }

  return Array.from(out.values()).sort((a, b) =>
    materialSortKey(a).localeCompare(materialSortKey(b)),
  );
}

/**
 * Find the actual suffix used by presets for this printer. If the printer's
 * own suffix has zero filament matches, try the compat fallback (e.g. P1S→X1C).
 */
function resolveEffectiveSuffix(printer: Printer, filamentList: MasterEntry[]): string {
  const has = (suf: string) => filamentList.some((f) => f.name.endsWith(` ${suf}`));
  if (has(printer.suffix)) return printer.suffix;
  const fb = SUFFIX_COMPAT[printer.suffix];
  if (fb && has(fb)) return fb;
  return printer.suffix;
}

// -------- Process matching --------

function escSuffix(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Real process preset name; throws only when nothing at all matches. */
export function findProcessInherits(
  printer: Printer,
  layerMm: number,
  _bases: string[] = [],
): string {
  void _bases;
  const index = getMasterIndexSync();
  const processes = index?.process_list.map((p) => p.name) ?? [];
  const layer = layerMm.toFixed(2);

  const tryFor = (suffix: string): string | null => {
    const esc = escSuffix(suffix);
    const byLayer = new RegExp(`^${layer}mm .+ ${esc}$`);
    for (const p of processes) if (byLayer.test(p)) return p;
    const standard = `0.20mm Standard ${suffix}`;
    if (processes.includes(standard)) return standard;
    const candidates = processes.filter((p) => p.endsWith(` ${suffix}`));
    if (candidates.length > 0) {
      let best = candidates[0];
      let bestDiff = Infinity;
      for (const c of candidates) {
        const m = c.match(/^(\d+\.\d+)mm/);
        if (!m) continue;
        const diff = Math.abs(parseFloat(m[1]) - layerMm);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = c;
        }
      }
      return best;
    }
    return null;
  };

  const filamentList = index?.filament_list ?? [];
  const effective = resolveEffectiveSuffix(printer, filamentList);
  const direct = tryFor(effective);
  if (direct) return direct;
  const fb = SUFFIX_COMPAT[effective];
  if (fb) {
    const via = tryFor(fb);
    if (via) return via;
  }
  throw new Error(
    `Preset de processo ainda não sincronizado para ${printer.displayName}. Recarregue em alguns segundos.`,
  );
}

/** Snap a requested layer height to a value that actually exists for this printer+suffix.
 *  Bicos maiores usam camadas maiores; presets 0.6/0.8 já ficam na faixa 0.28–0.6mm. */
export function snapLayerToPreset(printer: Printer, requestedMm: number): number {
  try {
    const leaf = findProcessInherits(printer, requestedMm, []);
    const m = leaf.match(/^(\d+\.\d+)mm/);
    if (m) return parseFloat(m[1]);
  } catch {
    /* ignore */
  }
  return requestedMm;
}

/** Real filament preset name. When material.id is a full leaf name, use it directly. */
export function findFilamentInherits(printer: Printer, material: MaterialBase): string {
  const index = getMasterIndexSync();
  const bases = index?.filament_list.map((f) => f.name) ?? [];
  // If material.id/inheritsBaseName is already a real leaf name, honor it.
  if (bases.includes(material.inheritsBaseName)) return material.inheritsBaseName;
  if (bases.includes(material.id)) return material.id;

  // Fallback: match by base name + suffix (legacy history entries).
  const effective = resolveEffectiveSuffix(printer, index?.filament_list ?? []);
  const suffixes = [effective, SUFFIX_COMPAT[effective]].filter(Boolean) as string[];
  for (const suffix of suffixes) {
    const exact = `${material.inheritsBaseName} ${suffix}`;
    if (bases.includes(exact)) return exact;
    const partial = bases.find(
      (b) => b.startsWith(material.inheritsBaseName) && b.endsWith(` ${suffix}`),
    );
    if (partial) return partial;
    // Also try relabelled family (e.g. "Bambu PLA Basic" via detected type).
    const labelMatch = bases.find(
      (b) => b.endsWith(` ${suffix}`) && detectType(b).type === material.filamentType,
    );
    if (labelMatch) return labelMatch;
  }
  throw new Error(
    `Preset de filamento "${material.label}" ainda não sincronizado para ${printer.displayName}.`,
  );
}

// -------- Compat validators (used by threemf) --------

export function isKnownProcess(name: string): boolean {
  const idx = getMasterIndexSync();
  return !!idx?.process_list.some((p) => p.name === name);
}
export function isKnownFilament(name: string): boolean {
  const idx = getMasterIndexSync();
  return !!idx?.filament_list.some((f) => f.name === name);
}

// -------- Silent sync API --------

/** Fire-and-forget silent refresh. NEVER throws. */
export async function silentSync(): Promise<void> {
  try {
    await syncMasterIndex();
  } catch {
    /* swallow */
  }
}
