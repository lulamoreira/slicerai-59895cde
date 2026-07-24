import JSZip from "jszip";
import type { MaterialBase, Printer, STLMesh, Vec3, WizardState } from "./types";
import { findFilamentInherits, findProcessInherits } from "./catalog";
import { purposeProfile, supportConfig, type SupportConfig } from "./rules";

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
  // 4 decimals with dot
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
    // XYZ Euler intrinsic: R = Rz * Ry * Rx
    for (let i = 0; i < positions.length; i += 3) {
      let x = positions[i], y = positions[i + 1], z = positions[i + 2];
      // Rx
      let y1 = y * cx - z * sx;
      let z1 = y * sx + z * cx;
      y = y1; z = z1;
      // Ry
      let x1 = x * cy + z * sy;
      z1 = -x * sy + z * cy;
      x = x1; z = z1;
      // Rz
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

function stringifyAll(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) out[k] = v.map((x) => String(x));
    else out[k] = String(v);
  }
  return out;
}

const VALID_BEDS = new Set(["Cool Plate", "Engineering Plate", "High Temp Plate", "Textured PEI Plate", "Smooth PEI Plate"]);

export interface GenerateResult {
  blob: Blob;
  fileName: string;
  summary: string;
  processName: string;
  filamentName: string;
  size: Vec3;
  settings: {
    project: Record<string, unknown>;
    process: Record<string, unknown>;
    filament: Record<string, unknown>;
  };
}

function assemble(
  state: WizardState,
  printer: Printer,
  material: MaterialBase,
  sup: SupportConfig,
  bed: string,
): { project: Record<string, unknown>; process: Record<string, unknown>; filament: Record<string, unknown>; processName: string; filamentName: string } {
  const purpose = state.purpose!;
  const prof = purposeProfile(purpose, material);
  const timestamp = Date.now();
  const processName = `SlicerAI_${purpose}_${printer.suffix.replace(/[^A-Za-z0-9]/g, "")}_${timestamp}`;
  const filamentName = `SlicerAI_${material.id}_${printer.suffix.replace(/[^A-Za-z0-9]/g, "")}_${timestamp}`;

  const processInherits = findProcessInherits(printer, prof.layer, []);
  const filamentInherits = findFilamentInherits(printer, material);

  const overrides = state.overrides;
  const layer = overrides.layer_height ?? String(prof.layer);
  const walls = overrides.wall_loops ?? String(prof.walls);
  const infill = overrides.sparse_infill_density ?? `${prof.infill}%`;
  const pattern = overrides.sparse_infill_pattern ?? prof.pattern;
  const wallGen = overrides.wall_generator ?? prof.wallGenerator;

  const process: Record<string, unknown> = {
    type: "process",
    name: processName,
    from: "User",
    setting_id: `GP_SlicerAI_${timestamp}`,
    inherits: processInherits,
    instantiation: "true",
    version: VERSION,
    print_settings_id: processName,
    compatible_printers: [printer.id],

    layer_height: layer,
    initial_layer_print_height: "0.2",
    wall_loops: walls,
    sparse_infill_density: infill,
    sparse_infill_pattern: pattern,
    wall_generator: wallGen,
    outer_wall_speed: String(prof.outerSpeed),

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

  const filament: Record<string, unknown> = {
    type: "filament",
    name: filamentName,
    from: "User",
    setting_id: `GFSA_SlicerAI_${timestamp}`,
    filament_id: material.filamentId,
    inherits: filamentInherits,
    instantiation: "true",
    version: VERSION,
    filament_settings_id: [filamentName],
    filament_type: [material.filamentType],
    filament_diameter: ["1.75"],
    filament_colour: [state.color.toUpperCase()],
    filament_is_support: ["0"],
    compatible_printers: [printer.id],

    nozzle_temperature: [String(material.nozzle)],
    nozzle_temperature_initial_layer: [String(material.nozzle)],
    hot_plate_temp: [String(material.bed)],
    hot_plate_temp_initial_layer: [String(material.bed)],
    filament_max_volumetric_speed: [String(material.volSpeed)],
    filament_flow_ratio: [String(material.flow)],
    fan_min_speed: [String(material.fanMin)],
    fan_max_speed: [String(material.fanMax)],
    close_fan_the_first_x_layers: ["1"],
    filament_retraction_length: [String(material.retraction)],
  };

  const project: Record<string, unknown> = {
    from: "User",
    name: `SlicerAI Project ${timestamp}`,
    version: VERSION,
    is_custom_defined: "0",
    printer_settings_id: printer.id,
    print_settings_id: processName,
    filament_settings_id: [filamentName],
    printer_model: printer.printerModel,
    printer_variant: printer.printerVariant,
    nozzle_diameter: [printer.printerVariant],
    filament_diameter: ["1.75"],
    filament_colour: [state.color.toUpperCase()],
    filament_type: [material.filamentType],
    filament_is_support: ["0"],
    filament_max_volumetric_speed: [String(material.volSpeed)],
    default_print_profile: processInherits,
    default_filament_profile: [filamentInherits],
    inherits_group: ["", "", ""],
    different_settings_to_system: ["", "", ""],
    curr_bed_type: bed,
    // include process + filament settings inline for convenience
    ...process,
    ...filament,
  };

  return { project, process, filament, processName, filamentName };
}

export function validate(
  state: WizardState,
  built: { project: Record<string, unknown>; process: Record<string, unknown>; filament: Record<string, unknown>; processName: string; filamentName: string },
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!state.color || !/^#[0-9A-Fa-f]{6}$/.test(state.color)) errors.push("Cor do filamento é obrigatória (#RRGGBB).");
  if (!VALID_BEDS.has(state.bed)) errors.push(`curr_bed_type inválido: ${state.bed}`);
  if (!Array.isArray(built.filament.filament_settings_id)) errors.push("filament_settings_id deve ser array.");
  if (!Array.isArray(built.filament.filament_colour) || (built.filament.filament_colour as string[]).length === 0) errors.push("filament_colour ausente ou vazio.");

  const parallelKeys = ["filament_colour", "filament_diameter", "filament_type", "filament_settings_id", "filament_is_support"];
  const lens = parallelKeys.map((k) => (Array.isArray(built.project[k]) ? (built.project[k] as unknown[]).length : -1));
  if (new Set(lens).size !== 1 || lens[0] < 1) errors.push("Arrays paralelos do filamento devem ter mesmo tamanho.");

  if (!built.processName.startsWith("SlicerAI_")) errors.push("Nome do processo deve começar com 'SlicerAI_'.");
  if (!built.filamentName.startsWith("SlicerAI_")) errors.push("Nome do filamento deve começar com 'SlicerAI_'.");

  const check = (o: Record<string, unknown>, path: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) {
        for (const x of v) if (typeof x !== "string") errors.push(`${path}.${k} contém não-string.`);
      } else if (typeof v !== "string") errors.push(`${path}.${k} não é string.`);
    }
  };
  check(built.process, "process");
  check(built.filament, "filament");
  check(built.project, "project");

  return { ok: errors.length === 0, errors };
}

export function generate3mf(state: WizardState): GenerateResult {
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

  const bed = state.bed;
  const built = stringifyAllSet(assemble(state, printer, material, sup, bed));

  const validation = validate(state, built);
  if (!validation.ok) {
    throw new Error(`Validação falhou:\n- ${validation.errors.join("\n- ")}`);
  }

  const transformed = transformMesh(state.mesh, rotation, state.centerOnBed, printer);
  const modelXml = build3dmodelXml(transformed);

  // Ensure no comma decimals in mesh
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

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", RELS);
  zip.folder("3D")!.file("3dmodel.model", modelXml);
  const meta = zip.folder("Metadata")!;
  meta.file("project_settings.config", JSON.stringify(built.project, null, 1));
  meta.file("process_settings_1.config", JSON.stringify(built.process, null, 1));
  meta.file("filament_settings_1.config", JSON.stringify(built.filament, null, 1));
  meta.file("model_settings.config", modelSettings);
  meta.file("slice_info.config", sliceInfo);

  // return a Blob synchronously via generateAsync... need sync signature; use generateAsync but wrap
  // We'll return via a thenable pattern: caller uses generate3mfAsync
  throw new Error("Use generate3mfAsync");
  void transformed; void built; void modelXml;
}

function stringifyAllSet(built: ReturnType<typeof assemble>) {
  return {
    ...built,
    project: stringifyAll(built.project),
    process: stringifyAll(built.process),
    filament: stringifyAll(built.filament),
  };
}

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
  const built = stringifyAllSet(assemble(state, printer, material, sup, state.bed));
  const validation = validate(state, built);
  if (!validation.ok) throw new Error(`Validação falhou:\n- ${validation.errors.join("\n- ")}`);

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

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", RELS);
  zip.folder("3D")!.file("3dmodel.model", modelXml);
  const meta = zip.folder("Metadata")!;
  meta.file("project_settings.config", JSON.stringify(built.project, null, 1));
  meta.file("process_settings_1.config", JSON.stringify(built.process, null, 1));
  meta.file("filament_settings_1.config", JSON.stringify(built.filament, null, 1));
  meta.file("model_settings.config", modelSettings);
  meta.file("slice_info.config", sliceInfo);

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "model/3mf",
  });

  const baseName = state.mesh.fileName.replace(/\.stl$/i, "") || "modelo";
  const fileName = `${baseName}_SlicerAI.3mf`;

  const summary = buildSummary(state, printer, material, sup, transformed.size, built.processName, built.filamentName);

  return {
    blob,
    fileName,
    summary,
    processName: built.processName,
    filamentName: built.filamentName,
    size: transformed.size,
    settings: { project: built.project, process: built.process, filament: built.filament },
  };
}

function buildSummary(
  state: WizardState,
  printer: Printer,
  material: MaterialBase,
  sup: SupportConfig,
  size: Vec3,
  processName: string,
  filamentName: string,
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
  lines.push(`Preset processo: ${processName}`);
  lines.push(`Preset filamento: ${filamentName}`);
  lines.push("");
  lines.push("Obs.: os valores de flow são ponto de partida — calibre em 1 spool novo.");
  return lines.join("\n");
}

export function exportPresetsJson(state: WizardState): Blob {
  if (!state.mesh || !state.printer || !state.material || !state.purpose) {
    throw new Error("Estado incompleto.");
  }
  const printer = state.printer!;
  const material = state.material!;
  const chosen = state.orientations.find((o) => o.key === state.chosenOrientationKey) ?? state.orientations[0];
  void chosen;
  const supportOn =
    state.supportMode === "off" ? false : state.supportMode === "auto" ? (state.analysis?.needsSupport ?? false) : true;
  const supportType: "normal" | "tree" =
    state.supportMode === "tree" ? "tree" : state.supportMode === "normal" ? "normal" : state.analysis?.suggestedType === "tree" ? "tree" : "normal";
  const sup = supportConfig(material, supportType, supportOn);
  const built = stringifyAllSet(assemble(state, printer, material, sup, state.bed));
  return new Blob([JSON.stringify(built, null, 2)], { type: "application/json" });
}

// Silence unused warnings for exported helpers
void generate3mf;
