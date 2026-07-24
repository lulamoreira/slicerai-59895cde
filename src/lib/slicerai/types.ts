export type Vec3 = [number, number, number];

export interface STLMesh {
  positions: Float32Array; // xyz per vertex (unique)
  indices: Uint32Array; // triangles
  triCount: number;
  bbox: { min: Vec3; max: Vec3; size: Vec3 };
  volumeMm3: number;
  fileName: string;
}

export interface Printer {
  id: string; // printer_settings_id, ex: "Bambu Lab A1 0.4 nozzle"
  displayName: string;
  printerModel: string; // "Bambu Lab A1"
  printerVariant: string; // "0.4"
  modelId: string; // "N2S"
  bed: Vec3; // [x,y,z] mm
  suffix: string; // "@BBL A1"
  fromGithub?: boolean;
}

export interface MaterialBase {
  id: string; // "PLA", "PETG"...
  label: string;
  filamentId: string; // GFA00 etc
  inheritsBaseName: string; // "Bambu <X> @BBL <suffix>" prefix (before suffix)
  nozzle: number; // nozzle temp (subsequent layers)
  nozzleInitial?: number; // nozzle temp on 1st layer (defaults to nozzle if omitted)
  bed: number;
  volSpeed: number;
  flow: number;
  fanMin: number;
  fanMax: number;
  retraction: number;
  filamentType: string; // "PLA", "PETG", "ABS", "ASA", "TPU", "PA", "PLA-CF", "PETG-CF"
  open?: boolean; // needs enclosure warning if opened
}


export type Purpose = "decoracao" | "mecanica" | "miniatura" | "prototipo" | "flexivel";

export interface SupportAnalysis {
  totalArea: number;
  supportArea: number;
  bridgeArea: number;
  supportPct: number; // 0..1
  flatSuspendedArea: number;
  overhangSteepArea: number;
  needsSupport: boolean;
  suggestedType: "normal" | "tree" | "none";
  reason: string;
  faceFlags: Uint8Array; // 0 none, 1 needs support, 2 bridge ok
}

export interface OrientationResult {
  key: string; // "original", "flipX180", etc.
  label: string;
  rotation: Vec3; // Euler in radians (Z-up)
  analysis: SupportAnalysis;
  fits: boolean;
  heightMm: number;
  bboxSize: Vec3;
}

export interface WizardState {
  mesh: STLMesh | null;
  printer: Printer | null;
  centerOnBed: boolean;
  material: MaterialBase | null;
  color: string;
  purpose: Purpose | null;
  analysis: SupportAnalysis | null;
  orientations: OrientationResult[];
  chosenOrientationKey: string;
  overrides: Partial<Record<string, string>>;
  supportMode: "auto" | "normal" | "tree" | "off";
  bed: string; // curr_bed_type
  ironing: {
    type?: "no ironing" | "top" | "topmost" | "solid"; // undefined = auto by purpose
    flow: string;    // e.g. "10%"
    spacing: string; // e.g. "0.1"
    speed: string;   // e.g. "20"
  };
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  fileName: string;
  printerId: string;
  materialId: string;
  purpose: Purpose;
  color: string;
  supportMode: string;
  settingsJson: string; // to allow "regerar"
}
