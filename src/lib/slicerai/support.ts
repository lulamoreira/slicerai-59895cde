import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import type { MaterialBase, OrientationResult, Purpose, STLMesh, SupportAnalysis, Vec3 } from "./types";

// Patch raycast once (idempotent).
// @ts-expect-error augment
THREE.Mesh.prototype.raycast = acceleratedRaycast;

interface PreppedMesh {
  geometry: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  raycaster: THREE.Raycaster;
  triNormals: Float32Array;
  triCentroids: Float32Array;
  triAreas: Float32Array;
  triMinZ: Float32Array;
  triCount: number;
  bedZ: number; // min Z after apply rotation (=0 after settle)
  size: Vec3;
}

function buildGeometry(mesh: STLMesh, rotation?: Vec3): PreppedMesh {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(mesh.positions);
  const idx = new Uint32Array(mesh.indices);

  if (rotation && (rotation[0] || rotation[1] || rotation[2])) {
    const m = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ"),
    );
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
      v.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(m);
      positions[i] = v.x; positions[i + 1] = v.y; positions[i + 2] = v.z;
    }
  }

  // Settle: translate so minZ = 0
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i];
    if (positions[i + 1] < minY) minY = positions[i + 1];
    if (positions[i + 2] < minZ) minZ = positions[i + 2];
    if (positions[i] > maxX) maxX = positions[i];
    if (positions[i + 1] > maxY) maxY = positions[i + 1];
    if (positions[i + 2] > maxZ) maxZ = positions[i + 2];
  }
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= (minX + maxX) / 2;
    positions[i + 1] -= (minY + maxY) / 2;
    positions[i + 2] -= minZ;
  }
  const size: Vec3 = [maxX - minX, maxY - minY, maxZ - minZ];

  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  geom.computeVertexNormals();

  const bvh = new MeshBVH(geom);
  // @ts-expect-error attach
  geom.boundsTree = bvh;

  const mat = new THREE.MeshBasicMaterial();
  const meshObj = new THREE.Mesh(geom, mat);

  const triCount = idx.length / 3;
  const triNormals = new Float32Array(triCount * 3);
  const triCentroids = new Float32Array(triCount * 3);
  const triAreas = new Float32Array(triCount);
  const triMinZ = new Float32Array(triCount);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < triCount; i++) {
    const ia = idx[i * 3] * 3, ib = idx[i * 3 + 1] * 3, ic = idx[i * 3 + 2] * 3;
    a.set(positions[ia], positions[ia + 1], positions[ia + 2]);
    b.set(positions[ib], positions[ib + 1], positions[ib + 2]);
    c.set(positions[ic], positions[ic + 1], positions[ic + 2]);
    ab.subVectors(b, a); ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    const area = n.length() / 2;
    n.normalize();
    triNormals[i * 3] = n.x; triNormals[i * 3 + 1] = n.y; triNormals[i * 3 + 2] = n.z;
    triCentroids[i * 3] = (a.x + b.x + c.x) / 3;
    triCentroids[i * 3 + 1] = (a.y + b.y + c.y) / 3;
    triCentroids[i * 3 + 2] = (a.z + b.z + c.z) / 3;
    triAreas[i] = area;
    triMinZ[i] = Math.min(a.z, b.z, c.z);
  }

  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;

  return { geometry: geom, mesh: meshObj, raycaster, triNormals, triCentroids, triAreas, triMinZ, triCount, bedZ: 0, size };
}

export function analyzeSupport(
  mesh: STLMesh,
  material: MaterialBase | null,
  rotation: Vec3 = [0, 0, 0],
): { analysis: SupportAnalysis; size: Vec3 } {
  const prepped = buildGeometry(mesh, rotation);
  const { triNormals, triCentroids, triAreas, triMinZ, triCount } = prepped;

  const faceFlags = new Uint8Array(triCount);
  let totalArea = 0;
  let supportArea = 0;
  let bridgeArea = 0;
  let flatSuspendedArea = 0;
  let overhangSteepArea = 0;

  const bridgeMax =
    material && ["PETG", "ABS", "ASA", "TPU"].includes(material.filamentType) ? 5 : 8;

  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3(0, 0, -1);
  const raycaster = prepped.raycaster;
  raycaster.set(rayOrigin, rayDir);

  for (let i = 0; i < triCount; i++) {
    totalArea += triAreas[i];
    const nz = triNormals[i * 3 + 2];
    if (nz >= -0.5) continue; // not down-facing
    if (triMinZ[i] <= 0.5) continue; // touching bed

    // cast ray from just below centroid
    const cx = triCentroids[i * 3];
    const cy = triCentroids[i * 3 + 1];
    const cz = triCentroids[i * 3 + 2];
    rayOrigin.set(cx, cy, cz - 0.05);
    raycaster.set(rayOrigin, rayDir);
    const hits = raycaster.intersectObject(prepped.mesh, false);

    // if hits before bed => there is material below
    let supported = false;
    for (const h of hits) {
      if (h.distance > 0.05 && h.point.z > 0.1) { supported = true; break; }
    }
    if (supported) continue;

    // Estimate span by triangle bbox width (proxy)
    const ia = mesh.indices[i * 3], ib = mesh.indices[i * 3 + 1], ic = mesh.indices[i * 3 + 2];
    // Approx span = sqrt(area * 4)
    const span = Math.sqrt(triAreas[i] * 4);

    if (span <= bridgeMax) {
      faceFlags[i] = 2;
      bridgeArea += triAreas[i];
      continue;
    }
    faceFlags[i] = 1;
    supportArea += triAreas[i];
    if (nz < -0.85) flatSuspendedArea += triAreas[i];
    else overhangSteepArea += triAreas[i];
    void ia; void ib; void ic;
  }

  const supportPct = totalArea > 0 ? supportArea / totalArea : 0;
  const hasLargeFlat = flatSuspendedArea > 25; // 25mm² threshold
  const needsSupport = supportPct > 0.02 || hasLargeFlat;

  let suggestedType: "normal" | "tree" | "none" = "none";
  let reason = "Sem overhangs significativos; imprimir sem suporte.";
  if (needsSupport) {
    const flatDominant = flatSuspendedArea > overhangSteepArea;
    const petgFamily = material && ["PETG", "ABS", "ASA", "TPU"].includes(material.filamentType);
    if (flatDominant || petgFamily) {
      suggestedType = "normal";
      reason = `Detectei ${(supportPct * 100).toFixed(1)}% da área com overhangs, com predominância de pisos planos suspensos sobre vão maior que ${bridgeMax}mm — sem suporte, esses pisos cederiam. Recomendo suporte NORMAL (interface densa segura o piso; folga de topo ajustada por material).`;
    } else {
      suggestedType = "tree";
      reason = `Detectei ${(supportPct * 100).toFixed(1)}% da área com overhangs íngremes/orgânicos. Suporte TREE (árvore orgânica) atinge esses pontos gastando menos material e deixa marcas mais leves.`;
    }
  }

  // free geometry to release memory
  prepped.geometry.dispose();

  return {
    analysis: {
      totalArea,
      supportArea,
      bridgeArea,
      supportPct,
      flatSuspendedArea,
      overhangSteepArea,
      needsSupport,
      suggestedType,
      reason,
      faceFlags,
    },
    size: prepped.size,
  };
}

const ORIENTATIONS: Array<{ key: string; label: string; rot: Vec3 }> = [
  { key: "original", label: "Original", rot: [0, 0, 0] },
  { key: "flipX180", label: "Girar 180° em X", rot: [Math.PI, 0, 0] },
  { key: "rotX90", label: "Girar 90° em X", rot: [Math.PI / 2, 0, 0] },
  { key: "rotXm90", label: "Girar -90° em X", rot: [-Math.PI / 2, 0, 0] },
  { key: "rotY90", label: "Girar 90° em Y", rot: [0, Math.PI / 2, 0] },
  { key: "rotYm90", label: "Girar -90° em Y", rot: [0, -Math.PI / 2, 0] },
];

export function analyzeAllOrientations(
  mesh: STLMesh,
  material: MaterialBase | null,
  bed: Vec3,
): OrientationResult[] {
  const results: OrientationResult[] = [];
  for (const o of ORIENTATIONS) {
    const { analysis, size } = analyzeSupport(mesh, material, o.rot);
    const fits = size[0] <= bed[0] && size[1] <= bed[1] && size[2] <= bed[2];
    results.push({
      key: o.key,
      label: o.label,
      rotation: o.rot,
      analysis,
      fits,
      heightMm: size[2],
      bboxSize: size,
    });
  }
  return results;
}

export function pickBestOrientation(results: OrientationResult[]): OrientationResult {
  const fitting = results.filter((r) => r.fits);
  const pool = fitting.length > 0 ? fitting : results;
  return pool.slice().sort((a, b) => a.analysis.supportPct - b.analysis.supportPct)[0];
}

export function purposeToTreePreference(p: Purpose | null): boolean {
  return p === "miniatura";
}
