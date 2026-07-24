import JSZip from "jszip";
import type { MaterialBase, Printer, STLMesh, Vec3, WizardState } from "./types";
import { findFilamentInherits, findProcessInherits } from "./catalog";
import { purposeProfile, supportConfig, type SupportConfig } from "./rules";
import { resolveChain } from "./resolve";

const VERSION = "02.07.01.62";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: number): string {
  const s = n.toFixed(4);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

function transformMesh(mesh: STLMesh, rotation: Vec3, centerOnBed: boolean, printer: Printer) {
  const positions = new Float32Array(mesh.positions);
  if (rotation[0] || rotation[1] || rotation[2]) {
    const [rx, ry, rz] = rotation;
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    for (let i = 0; i < positions.length; i += 3) {
      let x = positions[i], y = positions[i + 1], z = positions[i + 2];
      let y1 = y * cx - z * sx;
      let z1 = y * sx + z * cx;
      y = y1; z = z1;
      let x1 = x * cy + z * sy;
      z1 = -x * sy + z * cy;
      x = x1; z = z1;
      x1 = x * cz - y * sz;
      y1 = x * sz + y * cz;
      x = x1; y = y1;
      positions[i] = x; positions[i + 1] = y; positions[i + 2] = z;
    }
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i];
    if (positions[i + 1] < minY) minY = positions[i + 1];
    if (positions[i + 2] < minZ) minZ = positions[i + 2];
    if (positions[i] > maxX) maxX = positions[i];
    if (positions[i + 1] > maxY) maxY = positions[i + 1];
    if (positions[i + 2] > maxZ) maxZ = positions[i + 2];
  }
  const tx = centerOnBed ? printer.bed[0] / 2 - (minX + maxX) / 2 : -minX;
  const ty = centerOnBed ? printer.bed[1] / 2 - (minY + maxY) / 2 : -minY;
  const tz = -minZ;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += tx; positions[i + 1] += ty; positions[i + 2] += tz;
  }
  return { positions, indices: mesh.indices, size: [maxX - minX, maxY - minY, maxZ - minZ] as Vec3 };
}

function build3dmodelXml(mesh: { positions: Float32Array; indices: Uint32Array }): string {
  const { positions, indices } = mesh;
  const vertLines: string[] = [];
  vertLines.push("     <vertices>");
  for (let i = 0; i < positions.length; i += 3) {
    vertLines.push(
      `      <vertex x="${fmt(positions[i])}" y="${fmt(positions[i + 1])}" z="${fmt(positions[i + 2])}"/>`,
    );
  }
  vertLines.push("     </vertices>");
  const triLines: string[] = [];
  triLines.push("     <triangles>");
  for (let i = 0; i < indices.length; i += 3) {
    triLines.push(
      `      <triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}"/>`,
    );
  }
  triLines.push("     </triangles>");

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="Application">SlicerAI</metadata>
 <resources>
  <object id="1" p:UUID="00000000-0000-0000-0000-000000000001" type="model">
   <mesh>
${vertLines.join("\n")}
${triLines.join("\n")}
   </mesh>
  </object>
 </resources>
 <build p:UUID="00000000-0000-0000-0000-00000000000A">
  <item objectid="1" p:UUID="00000000-0000-0000-0000-000000000002" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>
 </build>
</model>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

const VALID_BEDS = new Set(["Cool Plate", "Engineering Plate", "High Temp Plate", "Textured PEI Plate", "Smooth PEI Plate"]);

/** Meta keys that must NOT appear in project_settings.config. */
const META_STRIP = new Set([
  "type", "name", "from", "setting_id", "instantiation", "inherits",
  "filament_id", "filament_settings_id", "print_settings_id", "printer_settings_id",
  "compatible_printers", "compatible_printers_condition",
  "compatible_prints", "compatible_prints_condition",
  "version", "is_custom_defined",
]);

function toStringy(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "boolean" ? (x ? "1" : "0") : String(x)));
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export interface GenerateResult {
  blob: Blob;
  fileName: string;
  summary: string;
  processName: string;
  filamentName: string;
  size: Vec3;
  settings: Record<string, unknown>;
  report: {
    blob: Blob;
    fileName: string;
    text: string;
  };
}

function resolveIroningType(state: WizardState): "no ironing" | "top" | "topmost" | "solid" {
  if (state.ironing.type) return state.ironing.type;
  return state.purpose === "decoracao" ? "top" : "no ironing";
}

async function assembleCfg(
  state: WizardState,
  printer: Printer,
  material: MaterialBase,
  sup: SupportConfig,
  bed: string,
): Promise<{ cfg: Record<string, unknown>; processLeaf: string; filamentLeaf: string }> {
  const purpose = state.purpose!;
  const prof = purposeProfile(purpose, material);
  const overrides = state.overrides;

  const layerStr = overrides.layer_height ?? String(prof.layer);
  const walls = overrides.wall_loops ?? String(prof.walls);
  const infill = overrides.sparse_infill_density ?? `${prof.infill}%`;
  const pattern = overrides.sparse_infill_pattern ?? prof.pattern;
  const wallGen = overrides.wall_generator ?? prof.wallGenerator;
  const ironingType = resolveIroningType(state);

  const machineLeaf = printer.id;
  const processLeaf = findProcessInherits(printer, parseFloat(layerStr), []);
  const filamentLeaf = findFilamentInherits(printer, material);

  const [machineCfg, processCfg, filamentCfg] = await Promise.all([
    resolveChain("machine", machineLeaf),
    resolveChain("process", processLeaf),
    resolveChain("filament", filamentLeaf),
  ]);

  const cfg: Record<string, unknown> = {};
  const copy = (src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      if (META_STRIP.has(k)) continue;
      cfg[k] = toStringy(v);
    }
  };
  copy(machineCfg);
  copy(processCfg);
  copy(filamentCfg);

  // ----- Process overrides (scalar strings) -----
  const processOverrides: Record<string, string> = {
    layer_height: layerStr,
    initial_layer_print_height: "0.2",
    wall_loops: walls,
    sparse_infill_density: infill,
    sparse_infill_pattern: pattern,
    wall_generator: wallGen,
    outer_wall_speed: String(prof.outerSpeed),
    ironing_type: ironingType,
    ironing_flow: state.ironing.flow,
    ironing_spacing: state.ironing.spacing,
    ironing_speed: state.ironing.speed,
    enable_support: sup.supportOn ? "1" : "0",
    support_type: sup.supportOn ? (sup.type === "tree" ? "tree(auto)" : "normal(auto)") : "normal(auto)",
    support_style: sup.style,
    support_top_z_distance: String(sup.topZ),
    support_bottom_z_distance: String(sup.bottomZ),
    support_threshold_angle: String(sup.thresholdAngle),
    support_object_xy_distance: String(sup.xyDistance),
    support_interface_top_layers: String(sup.interfaceTop),
    support_interface_bottom_layers: String(sup.interfaceBottom),
    support_interface_spacing: String(sup.interfaceSpacing),
    support_interface_pattern: sup.interfacePattern,
    support_base_pattern: sup.basePattern,
    support_base_pattern_spacing: "2.5",
    support_wall_count: String(sup.wallCount),
    tree_support_branch_angle: "40",
    tree_support_branch_diameter: "2",
    tree_support_tip_diameter: "0.4",
  };
  for (const [k, v] of Object.entries(processOverrides)) cfg[k] = v;

  // ----- Filament overrides (arrays of 1 string) -----
  const filamentOverrides: Record<string, string[]> = {
    filament_type: [material.filamentType],
    filament_diameter: ["1.75"],
    filament_is_support: ["0"],
    nozzle_temperature: [String(material.nozzle)],
    nozzle_temperature_initial_layer: [String(material.nozzleInitial ?? material.nozzle)],
    hot_plate_temp: [String(material.bed)],
    hot_plate_temp_initial_layer: [String(material.bed)],
    filament_max_volumetric_speed: [String(material.volSpeed)],
    filament_flow_ratio: [String(material.flow)],
    fan_min_speed: [String(material.fanMin)],
    fan_max_speed: [String(material.fanMax)],
    close_fan_the_first_x_layers: ["1"],
    filament_retraction_length: [String(material.retraction)],
  };
  for (const [k, v] of Object.entries(filamentOverrides)) cfg[k] = v;

  // ----- Project lineage (last write wins) -----
  cfg.from = "project";
  cfg.printer_settings_id = printer.id;
  cfg.print_settings_id = processLeaf;
  cfg.filament_settings_id = [filamentLeaf];
  cfg.nozzle_diameter = [printer.printerVariant];
  cfg.curr_bed_type = bed;
  cfg.filament_colour = [state.color.toUpperCase()];
  cfg.different_settings_to_system = [
    Object.keys(processOverrides).join(";"),
    Object.keys(filamentOverrides).join(";"),
    "",
  ];

  return { cfg, processLeaf, filamentLeaf };
}

function validateCfg(cfg: Record<string, unknown>, state: WizardState): string[] {
  const errors: string[] = [];
  const nKeys = Object.keys(cfg).length;
  if (nKeys <= 100) errors.push(`project_settings.config incompleto: ${nKeys} chaves (mínimo 100). Clique em "Aprender com o GitHub" e tente novamente.`);
  if (cfg.from !== "project") errors.push('cfg.from deve ser "project".');
  for (const bad of ["type", "inherits", "setting_id", "instantiation"]) {
    if (bad in cfg) errors.push(`cfg contém chave proibida: ${bad}`);
  }
  for (const req of ["printer_settings_id", "print_settings_id", "filament_settings_id", "nozzle_diameter", "curr_bed_type", "filament_colour"]) {
    if (!(req in cfg)) errors.push(`cfg sem chave obrigatória: ${req}`);
  }
  if (!Array.isArray(cfg.filament_colour) || (cfg.filament_colour as unknown[]).length === 0) {
    errors.push("filament_colour ausente.");
  }
  // different_settings_to_system: ordem obrigatória [process, filament, printer]
  const dss = cfg.different_settings_to_system;
  if (!Array.isArray(dss)) {
    errors.push("different_settings_to_system ausente ou não é array.");
  } else if (dss.length !== 3) {
    errors.push(`different_settings_to_system deve ter 3 slots [process, filament, printer]; encontrado ${dss.length}.`);
  } else if (dss.some((s) => typeof s !== "string")) {
    errors.push("different_settings_to_system deve conter apenas strings (ordem: process, filament, printer).");
  }
  if (!VALID_BEDS.has(state.bed)) errors.push(`curr_bed_type inválido: ${state.bed}`);
  if (!state.color || !/^#[0-9A-Fa-f]{6}$/.test(state.color)) errors.push("Cor do filamento é obrigatória (#RRGGBB).");
  return errors;
}

function validatePlate1(json: string): string[] {
  const errors: string[] = [];
  try {
    const p = JSON.parse(json) as Record<string, unknown>;
    if (typeof p.nozzle_diameter !== "number" || !(p.nozzle_diameter > 0)) {
      errors.push("plate_1.json: nozzle_diameter inválido.");
    }
    if (p.version !== 2) errors.push("plate_1.json: version deve ser 2.");
  } catch {
    errors.push("plate_1.json: JSON inválido.");
  }
  return errors;
}

export interface ValidationReport {
  ok: boolean;
  needsSync: boolean;
  keyCount: number;
  dssSlots: { process: string[]; filament: string[]; printer: string[]; length: number };
  plateOk: boolean;
  plateInfo: { nozzle: number; version: number } | null;
  processLeaf: string | null;
  filamentLeaf: string | null;
  errors: string[];
  warnings: string[];
}

function emptyReport(errors: string[], warnings: string[] = [], needsSync = false): ValidationReport {
  return {
    ok: false,
    needsSync,
    keyCount: 0,
    dssSlots: { process: [], filament: [], printer: [], length: 0 },
    plateOk: false,
    plateInfo: null,
    processLeaf: null,
    filamentLeaf: null,
    errors,
    warnings,
  };
}

export async function previewValidation(state: WizardState): Promise<ValidationReport> {
  if (!state.mesh || !state.printer || !state.material || !state.purpose) {
    return emptyReport(["Complete as etapas anteriores (STL, impressora, material e finalidade)."]);
  }
  const supportOn =
    state.supportMode === "off" ? false : state.supportMode === "auto" ? (state.analysis?.needsSupport ?? false) : true;
  const supportType: "normal" | "tree" =
    state.supportMode === "tree" ? "tree" : state.supportMode === "normal" ? "normal" : state.analysis?.suggestedType === "tree" ? "tree" : "normal";
  const sup = supportConfig(state.material, supportType, supportOn);

  let cfg: Record<string, unknown>;
  let processLeaf = "";
  let filamentLeaf = "";
  try {
    const res = await assembleCfg(state, state.printer, state.material, sup, state.bed);
    cfg = res.cfg;
    processLeaf = res.processLeaf;
    filamentLeaf = res.filamentLeaf;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isNetwork = /fetch|network|404|offline|preset/i.test(msg);
    return emptyReport([`Falha ao montar configuração: ${msg}`], [], isNetwork);
  }

  const cfgErrors = validateCfg(cfg, state);
  const plate1 = JSON.stringify({ nozzle_diameter: parseFloat(state.printer.printerVariant), version: 2 });
  const plateErrors = validatePlate1(plate1);

  const dssRaw = cfg.different_settings_to_system;
  const dssArr = Array.isArray(dssRaw) ? (dssRaw as unknown[]).map((s) => (typeof s === "string" ? s : "")) : [];
  const split = (i: number) => (dssArr[i] ? dssArr[i].split(";").filter(Boolean) : []);
  const dssSlots = {
    process: split(0),
    filament: split(1),
    printer: split(2),
    length: dssArr.length,
  };

  const keyCount = Object.keys(cfg).length;
  const plateInfo = plateErrors.length === 0 ? { nozzle: parseFloat(state.printer.printerVariant), version: 2 } : null;
  const warnings: string[] = [];
  if (dssSlots.process.length === 0 && dssSlots.filament.length === 0) {
    warnings.push("Nenhum override detectado — o .3mf usará somente os defaults do preset base.");
  }

  const needsSync = cfgErrors.some((e) => /incompleto|Aprender com o GitHub/.test(e));
  const errors = [...cfgErrors, ...plateErrors];

  return {
    ok: errors.length === 0,
    needsSync,
    keyCount,
    dssSlots,
    plateOk: plateErrors.length === 0,
    plateInfo,
    processLeaf,
    filamentLeaf,
    errors,
    warnings,
  };

export async function generate3mfAsync(state: WizardState): Promise<GenerateResult> {
  if (!state.mesh || !state.printer || !state.material || !state.purpose) {
    throw new Error("Estado incompleto para geração.");
  }
  const printer = state.printer;
  const material = state.material;

  const chosen = state.orientations.find((o) => o.key === state.chosenOrientationKey) ?? state.orientations[0];
  const rotation: Vec3 = chosen?.rotation ?? [0, 0, 0];

  const supportOn =
    state.supportMode === "off" ? false : state.supportMode === "auto" ? (state.analysis?.needsSupport ?? false) : true;
  const supportType: "normal" | "tree" =
    state.supportMode === "tree" ? "tree" : state.supportMode === "normal" ? "normal" : state.analysis?.suggestedType === "tree" ? "tree" : "normal";

  const sup = supportConfig(material, supportType, supportOn);

  const { cfg, processLeaf, filamentLeaf } = await assembleCfg(state, printer, material, sup, state.bed);

  const errors = validateCfg(cfg, state);
  if (errors.length) throw new Error(`Validação falhou:\n- ${errors.join("\n- ")}`);

  const transformed = transformMesh(state.mesh, rotation, state.centerOnBed, printer);
  const modelXml = build3dmodelXml(transformed);
  if (modelXml.includes(",")) throw new Error("Vírgula decimal detectada no mesh — abortando.");

  const modelSettings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
 <object id="1">
  <metadata key="name" value="${xmlEscape(state.mesh.fileName)}"/>
  <metadata key="extruder" value="1"/>
 </object>
</config>`;
  const sliceInfo = `<?xml version="1.0" encoding="UTF-8"?>
<config>
 <header>
  <header_item key="X-BBL-Client-Type" value="slicer"/>
  <header_item key="X-BBL-Client-Version" value="${VERSION}"/>
 </header>
 <plate>
  <metadata key="index" value="1"/>
  <metadata key="printer_model_id" value="${xmlEscape(printer.modelId)}"/>
  <metadata key="nozzle_diameters" value="${xmlEscape(printer.printerVariant)}"/>
 </plate>
</config>`;

  const plate1 = JSON.stringify({ nozzle_diameter: parseFloat(printer.printerVariant), version: 2 });

  const plateErrors = validatePlate1(plate1);
  if (plateErrors.length) throw new Error(`Validação falhou:\n- ${plateErrors.join("\n- ")}`);

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", RELS);
  zip.folder("3D")!.file("3dmodel.model", modelXml);
  const meta = zip.folder("Metadata")!;
  meta.file("project_settings.config", JSON.stringify(cfg));
  meta.file("model_settings.config", modelSettings);
  meta.file("slice_info.config", sliceInfo);
  meta.file("plate_1.json", plate1);

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "model/3mf",
  });

  const modelBase = sanitizeName(state.mesh.fileName.replace(/\.stl$/i, "") || "modelo");
  const printerShort = shortPrinterName(printer.printerModel);
  const materialShort = sanitizeName(material.id);
  const purposeShort = capitalizePurpose(state.purpose!);
  const baseName = `${modelBase}_${printerShort}_${materialShort}_${purposeShort}`;
  const fileName = `${baseName}.3mf`;

  const summary = buildSummary(state, printer, material, sup, transformed.size, processLeaf, filamentLeaf);
  const reportText = buildReport(state, printer, material, sup, transformed.size, cfg, processLeaf, filamentLeaf, resolveIroningType(state));
  const reportFileName = `${baseName}_LEIA-ME.txt`;
  const reportBlob = new Blob([reportText], { type: "text/plain;charset=utf-8" });

  return {
    blob,
    fileName,
    summary,
    processName: processLeaf,
    filamentName: filamentLeaf,
    size: transformed.size,
    settings: cfg,
    report: { blob: reportBlob, fileName: reportFileName, text: reportText },
  };
}

function sanitizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "");
}

const PRINTER_SHORT_MAP: Record<string, string> = {
  "Bambu Lab X1 Carbon": "X1C",
};

function shortPrinterName(model: string): string {
  if (PRINTER_SHORT_MAP[model]) return PRINTER_SHORT_MAP[model];
  return sanitizeName(model.replace(/^Bambu Lab\s*/i, "").replace(/\s+/g, ""));
}

function capitalizePurpose(p: string): string {
  const clean = p.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function buildSummary(
  state: WizardState,
  printer: Printer,
  material: MaterialBase,
  sup: SupportConfig,
  size: Vec3,
  processLeaf: string,
  filamentLeaf: string,
): string {
  const lines = [
    "SlicerAI — Resumo",
    `Arquivo: ${state.mesh?.fileName}`,
    `Impressora: ${printer.displayName} (${printer.id})`,
    `Placa: ${state.bed}`,
    `Material: ${material.label} — cor ${state.color}`,
    `Finalidade: ${state.purpose}`,
    `Dimensões finais: ${size[0].toFixed(1)} × ${size[1].toFixed(1)} × ${size[2].toFixed(1)} mm`,
    `Bico: ${material.nozzle}°C | Mesa: ${material.bed}°C | Vol. máx: ${material.volSpeed} mm³/s`,
    `Suporte: ${sup.supportOn ? `LIGADO (${sup.type.toUpperCase()})` : "DESLIGADO"}`,
  ];
  if (sup.supportOn) {
    lines.push(`  ↳ folga topo: ${sup.topZ}mm, ângulo: ${sup.thresholdAngle}°, XY: ${sup.xyDistance}mm, interfaces: ${sup.interfaceTop}/${sup.interfaceBottom}, padrão: ${sup.interfacePattern}`);
  }
  lines.push(`Preset processo base: ${processLeaf}`);
  lines.push(`Preset filamento base: ${filamentLeaf}`);
  lines.push("");
  lines.push("Obs.: os valores de flow são ponto de partida — calibre em 1 spool novo.");
  return lines.join("\n");
}

function buildReport(
  state: WizardState,
  printer: Printer,
  material: MaterialBase,
  sup: SupportConfig,
  size: Vec3,
  cfg: Record<string, unknown>,
  processLeaf: string,
  filamentLeaf: string,
  ironingType: "no ironing" | "top" | "topmost" | "solid",
): string {
  const L: string[] = [];
  const isDeco = state.purpose === "decoracao";
  const isTechnical = ["PETG", "PETG-CF", "ABS", "ASA", "PA", "PLA-CF"].includes(material.filamentType);
  const layer = String((cfg.layer_height as string) ?? "");
  const walls = String((cfg.wall_loops as string) ?? "");
  const infill = String((cfg.sparse_infill_density as string) ?? "");
  const wallGen = String((cfg.wall_generator as string) ?? "");

  L.push("SlicerAI — RELATÓRIO DA GERAÇÃO");
  L.push("=".repeat(48));
  L.push("");
  L.push(`Arquivo original : ${state.mesh?.fileName}`);
  L.push(`Peça (após rot.) : ${size[0].toFixed(1)} × ${size[1].toFixed(1)} × ${size[2].toFixed(1)} mm`);
  L.push(`Impressora       : ${printer.displayName} (${printer.id})`);
  L.push(`Placa            : ${state.bed}`);
  L.push(`Material / cor   : ${material.label} — ${state.color}`);
  L.push(`Finalidade       : ${state.purpose}`);
  L.push(`Preset processo  : ${processLeaf}`);
  L.push(`Preset filamento : ${filamentLeaf}`);
  L.push("");

  L.push("O QUE FOI APLICADO E POR QUÊ");
  L.push("-".repeat(48));
  L.push(`• Altura de camada ${layer} mm — equilíbrio entre acabamento e tempo para a finalidade "${state.purpose}".`);
  L.push(`• ${walls} paredes, preenchimento ${infill} — dimensionado para a finalidade.`);
  L.push(`• Gerador de parede: ${wallGen}${wallGen === "arachne" ? " — larguras variáveis para preservar detalhes finos." : " — traçado clássico, previsível para peças funcionais."}`);
  L.push(`• Bico ${material.nozzle}°C / mesa ${material.bed}°C, vazão máx ${material.volSpeed} mm³/s — perfil oficial do material.`);
  if (sup.supportOn) {
    L.push(`• Suporte ${sup.type.toUpperCase()} ligado: folga de topo ${sup.topZ}mm, ângulo ${sup.thresholdAngle}°, XY ${sup.xyDistance}mm — evita solda em ${material.filamentType} e melhora remoção.`);
  } else {
    L.push("• Sem suporte — a orientação escolhida elimina overhangs críticos.");
  }
  if (ironingType !== "no ironing") {
    L.push(`• Ironing "${ironingType}" (fluxo ${state.ironing.flow}, spacing ${state.ironing.spacing}mm, ${state.ironing.speed} mm/s) — alisa as superfícies de topo, tirando as linhas de camada. Ideal para display.`);
  } else {
    L.push("• Ironing desligado — não necessário para esta finalidade.");
  }
  L.push("");

  if (isDeco) {
    L.push("PASSO MANUAL: VARIABLE LAYER HEIGHT (recomendado p/ decoração)");
    L.push("-".repeat(48));
    L.push("O Variable/Adaptive Layer Height é gerado pelo Bambu Studio a partir");
    L.push("da geometria da peça — NÃO é um parâmetro simples do preset, por isso");
    L.push("não vem embarcado no .3mf. Faça em 30 segundos:");
    L.push("");
    L.push('  1) Abra o .3mf no Bambu Studio.');
    L.push('  2) Selecione a peça.');
    L.push('  3) Na barra superior, clique no ícone "Variable Layer Height"');
    L.push('     (o desenho de gota, no fim da barra).');
    L.push('  4) Clique em "Adaptive".');
    L.push('  5) Ajuste o slider Quality/Speed para ~0.3–0.4 (mais perto de Quality).');
    L.push('  6) Clique em "Smooth" com Radius ~5 para transições suaves.');
    L.push('  7) Feche o painel e clique em "Slice".');
    L.push("");
    L.push("Por quê: o Bambu vai usar camadas finas onde há curvas/detalhes e");
    L.push("camadas grossas onde é reto. Acabamento muito melhor sem estourar o tempo.");
    L.push("");
  }

  L.push("ANTES DE IMPRIMIR — CHECKLIST");
  L.push("-".repeat(48));
  if (isTechnical) {
    L.push(`• Secar o filamento (${material.filamentType} absorve umidade → bolhas e stringing).`);
  }
  L.push(`• Conferir se a impressora ativa no Bambu Studio é "${printer.displayName}".`);
  L.push(`• Confirmar a placa selecionada: "${state.bed}".`);
  L.push("• No Preview, trocar o tema para \"Layer Height\" e conferir a distribuição das camadas.");
  L.push("• Calibrar Flow ao menos 1x por spool nova (os valores aqui são ponto de partida).");
  if (sup.supportOn && (material.filamentType === "PLA" || material.filamentType === "PETG")) {
    L.push(`• Suporte em ${material.filamentType} tende a soldar em pontos críticos — considere Support Painting manual.`);
  }
  L.push("");
  L.push("Gerado por SlicerAI · 100% client-side.");
  return L.join("\n");
}
