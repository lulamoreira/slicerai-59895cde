import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import type { STLMesh, SupportAnalysis, Vec3 } from "@/lib/slicerai/types";

interface PreviewProps {
  mesh: STLMesh;
  rotation?: Vec3;
  faceFlags?: Uint8Array;
  color?: string;
  bed?: Vec3 | null;
}

function MeshView({ mesh, rotation, faceFlags, color }: PreviewProps) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(mesh.positions);
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
    // settle to Z=0 and center on XY
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= cx;
      positions[i + 1] -= cy;
      positions[i + 2] -= minZ;
    }

    // Expand per-face if we have flags to color
    if (faceFlags && faceFlags.length === mesh.indices.length / 3) {
      const triCount = mesh.indices.length / 3;
      const expanded = new Float32Array(triCount * 9);
      const colors = new Float32Array(triCount * 9);
      const cBase = new THREE.Color("#9ca3af");
      const cRed = new THREE.Color("#ef4444");
      const cYel = new THREE.Color("#f59e0b");
      for (let i = 0; i < triCount; i++) {
        const flag = faceFlags[i];
        const c = flag === 1 ? cRed : flag === 2 ? cYel : cBase;
        for (let v = 0; v < 3; v++) {
          const idx = mesh.indices[i * 3 + v] * 3;
          expanded[i * 9 + v * 3] = positions[idx];
          expanded[i * 9 + v * 3 + 1] = positions[idx + 1];
          expanded[i * 9 + v * 3 + 2] = positions[idx + 2];
          colors[i * 9 + v * 3] = c.r;
          colors[i * 9 + v * 3 + 1] = c.g;
          colors[i * 9 + v * 3 + 2] = c.b;
        }
      }
      g.setAttribute("position", new THREE.BufferAttribute(expanded, 3));
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      g.computeVertexNormals();
      return g;
    }

    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));
    g.computeVertexNormals();
    return g;
  }, [mesh, rotation, faceFlags, color]);

  useEffect(() => () => geom.dispose(), [geom]);

  const useVertexColors = !!faceFlags;
  return (
    <mesh geometry={geom} castShadow receiveShadow>
      <meshStandardMaterial
        color={useVertexColors ? undefined : "#9ca3af"}
        vertexColors={useVertexColors}
        roughness={0.6}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function CameraSetup({ target, bed }: { target: Vec3; bed: Vec3 | null }) {
  const { camera } = useThree();
  useEffect(() => {
    const reach = Math.max(
      target[0], target[1], target[2],
      bed ? bed[0] : 0,
      bed ? bed[1] : 0,
      50,
    );
    const d = reach * 1.3;
    camera.position.set(d, -d, d * 0.8);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, target[2] / 2);
  }, [camera, target, bed]);
  return null;
}

export function Preview3D(props: PreviewProps) {
  const size = props.mesh.bbox.size;
  const bedSize = props.bed ?? null;
  const ctrlRef = useRef(null);
  return (
    <div className="w-full h-full bg-muted/30 rounded-lg overflow-hidden">
      <Canvas shadows camera={{ fov: 45, near: 0.1, far: 5000, up: [0, 0, 1] }}>
        <color attach="background" args={["#0b0f14"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[100, 100, 200]} intensity={1.2} castShadow />
        <directionalLight position={[-100, -100, 100]} intensity={0.5} />
        <CameraSetup target={size} bed={bedSize} />
        <Suspense fallback={null}>
          <MeshView {...props} />
        </Suspense>
        {bedSize && (
          <>
            <mesh rotation={[0, 0, 0]} position={[0, 0, -0.1]}>
              <boxGeometry args={[bedSize[0], bedSize[1], 0.2]} />
              <meshStandardMaterial color="#1f2937" opacity={0.4} transparent />
            </mesh>
            <Grid
              position={[0, 0, 0.01]}
              args={[bedSize[0], bedSize[1]]}
              cellSize={10}
              cellThickness={0.5}
              cellColor="#334155"
              sectionSize={50}
              sectionThickness={1}
              sectionColor="#64748b"
              rotation={[Math.PI / 2, 0, 0]}
              infiniteGrid={false}
            />
          </>
        )}
        <OrbitControls ref={ctrlRef} makeDefault />
      </Canvas>
    </div>
  );
}

export function LegendChip({ analysis }: { analysis: SupportAnalysis | null }) {
  if (!analysis) return null;
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-[#ef4444]" /> Precisa suporte</span>
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-[#f59e0b]" /> Ponte ok</span>
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-[#F5C518]" /> Sem overhang</span>
    </div>
  );
}
