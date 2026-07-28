import type { MaterialBase, Printer, Purpose } from "./types";

/** PA / Nylon family — needs enclosed printer, hardened nozzle, drying. */
export function isNylonFamily(mat: MaterialBase | null | undefined): boolean {
  if (!mat) return false;
  const t = mat.filamentType.toUpperCase();
  if (t === "PA" || t === "PA-CF") return true;
  return /\b(PA6|PAHT|PA12|Nylon)\b/i.test(mat.label) || /\b(PA6|PAHT)\b/i.test(mat.id);
}

/** Abrasive fibre-reinforced material — requires hardened steel nozzle. */
export function isAbrasive(mat: MaterialBase | null | undefined): boolean {
  if (!mat) return false;
  return /-CF\b|-GF\b|CarbonFiber|GlassFiber/i.test(mat.label) || /-CF\b|-GF\b/i.test(mat.filamentType);
}

/** Frame-open Bambu printers where PA/Nylon is strongly discouraged. */
export function isOpenPrinter(p: Printer | null | undefined): boolean {
  if (!p) return false;
  return /A1( mini)?$/i.test(p.printerModel) || /P1P$/i.test(p.printerModel);
}

export interface PurposeProfile {
  layer: number;
  walls: number;
  infill: number; // %
  pattern: string; // "gyroid","grid","cubic"...
  wallGenerator: "classic" | "arachne";
  outerSpeed: number; // mm/s
}

export function purposeProfile(p: Purpose, mat: MaterialBase): PurposeProfile {
  switch (p) {
    case "decoracao":
      return { layer: 0.16, walls: 3, infill: 12, pattern: "gyroid", wallGenerator: "arachne", outerSpeed: 80 };
    case "mecanica":
      return { layer: 0.20, walls: 4, infill: 35, pattern: "grid", wallGenerator: "classic", outerSpeed: 100 };
    case "miniatura":
      return { layer: 0.10, walls: 3, infill: 10, pattern: "gyroid", wallGenerator: "arachne", outerSpeed: 50 };
    case "prototipo":
      return { layer: 0.28, walls: 2, infill: 10, pattern: "grid", wallGenerator: "classic", outerSpeed: 150 };
    case "flexivel":
      return { layer: 0.20, walls: 3, infill: 8, pattern: "gyroid", wallGenerator: "arachne", outerSpeed: 30 };
  }
  void mat;
  return { layer: 0.20, walls: 3, infill: 15, pattern: "grid", wallGenerator: "classic", outerSpeed: 100 };
}

export interface SupportConfig {
  supportOn: boolean;
  type: "normal" | "tree";
  topZ: number;
  bottomZ: number;
  thresholdAngle: number;
  xyDistance: number;
  interfaceTop: number;
  interfaceBottom: number;
  interfaceSpacing: number;
  interfacePattern: string;
  basePattern: string;
  wallCount: number;
  style: string;
}

export function supportConfig(mat: MaterialBase, type: "normal" | "tree", supportOn: boolean): SupportConfig {
  const topZByMat: Record<string, number> = {
    PLA: 0.20, "PLA-CF": 0.20, PETG: 0.25, "PETG-CF": 0.25, ABS: 0.22, ASA: 0.22, TPU: 0.25, PA: 0.22,
  };
  const angleByMat: Record<string, number> = {
    PLA: 45, "PLA-CF": 45, PETG: 50, "PETG-CF": 50, ABS: 50, ASA: 50, TPU: 50, PA: 50,
  };
  const topZ = topZByMat[mat.filamentType] ?? 0.20;
  const angle = angleByMat[mat.filamentType] ?? 45;

  return {
    supportOn,
    type,
    topZ,
    bottomZ: 0.20,
    thresholdAngle: angle,
    xyDistance: 0.40,
    interfaceTop: 2,
    interfaceBottom: 0,
    interfaceSpacing: 0,
    interfacePattern: type === "tree" ? "concentric" : "rectilinear_interlaced",
    basePattern: "rectilinear",
    wallCount: 0,
    style: type === "tree" ? "tree_organic" : "grid",
  };
}
