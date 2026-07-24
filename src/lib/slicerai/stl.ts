import type { STLMesh, Vec3 } from "./types";

function isAsciiSTL(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf, 0, Math.min(512, buf.byteLength));
  const head = new TextDecoder().decode(bytes).toLowerCase();
  return head.startsWith("solid") && head.includes("facet");
}

function parseAscii(text: string): { positions: number[]; normals: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const re =
    /facet\s+normal\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)[\s\S]*?vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const nx = +m[1], ny = +m[2], nz = +m[3];
    for (let i = 4; i <= 12; i++) positions.push(+m[i]);
    for (let i = 0; i < 3; i++) normals.push(nx, ny, nz);
  }
  return { positions, normals };
}

function parseBinary(buf: ArrayBuffer): { positions: number[] } {
  const dv = new DataView(buf);
  const triCount = dv.getUint32(80, true);
  const positions: number[] = [];
  let o = 84;
  for (let i = 0; i < triCount; i++) {
    // skip normal
    o += 12;
    for (let v = 0; v < 3; v++) {
      positions.push(dv.getFloat32(o, true));
      positions.push(dv.getFloat32(o + 4, true));
      positions.push(dv.getFloat32(o + 8, true));
      o += 12;
    }
    o += 2; // attribute byte count
  }
  return { positions };
}

function computeVolume(positions: Float32Array, indices: Uint32Array): number {
  let vol = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    vol += (ax * (by * cz - bz * cy) + bx * (cy * az - cz * ay) + cx * (ay * bz - az * by)) / 6;
  }
  return Math.abs(vol);
}

export async function parseSTL(file: File): Promise<STLMesh> {
  const buf = await file.arrayBuffer();
  let raw: number[];
  if (isAsciiSTL(buf)) {
    const text = new TextDecoder().decode(buf);
    raw = parseAscii(text).positions;
  } else {
    raw = parseBinary(buf).positions;
  }

  // Deduplicate vertices at 4 decimals
  const map = new Map<string, number>();
  const uniq: number[] = [];
  const indices: number[] = [];
  const key = (x: number, y: number, z: number) =>
    `${x.toFixed(4)}_${y.toFixed(4)}_${z.toFixed(4)}`;

  for (let i = 0; i < raw.length; i += 3) {
    const x = raw[i], y = raw[i + 1], z = raw[i + 2];
    const k = key(x, y, z);
    let idx = map.get(k);
    if (idx === undefined) {
      idx = uniq.length / 3;
      uniq.push(x, y, z);
      map.set(k, idx);
    }
    indices.push(idx);
  }

  const positions = new Float32Array(uniq);
  const indicesArr = new Uint32Array(indices);

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const volumeMm3 = computeVolume(positions, indicesArr);

  return {
    positions,
    indices: indicesArr,
    triCount: indicesArr.length / 3,
    bbox: { min, max, size },
    volumeMm3,
    fileName: file.name,
    sourceBuffer: buf,
  };

}
