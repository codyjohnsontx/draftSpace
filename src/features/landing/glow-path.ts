import * as THREE from "three";

const RADIAL_SEGMENTS = 8;
const INDICES_PER_SEGMENT = RADIAL_SEGMENTS * 6;

export function createPathCurve(points: THREE.Vector3[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
}

export type GlowSegment = {
  mesh: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  length: number;
  /** 0..1 drawn fraction; scrubs cleanly in both directions. */
  setProgress(progress: number): void;
};

export function createGlowSegment(
  points: THREE.Vector3[],
  options: { color: THREE.ColorRepresentation; radius?: number; tubularSegments?: number } ,
): GlowSegment {
  const curve = createPathCurve(points);
  const tubularSegments = options.tubularSegments ?? 280;
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, options.radius ?? 0.11, RADIAL_SEGMENTS, false);
  const material = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: options.color,
    emissiveIntensity: 2.6,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  geometry.setDrawRange(0, 0);

  function setProgress(progress: number): void {
    const clamped = THREE.MathUtils.clamp(progress, 0, 1);
    geometry.setDrawRange(0, Math.floor(clamped * tubularSegments) * INDICES_PER_SEGMENT);
  }

  return { mesh, curve, length: curve.getLength(), setProgress };
}

export type CometHead = {
  group: THREE.Group;
  setPosition(position: THREE.Vector3): void;
  setVisible(visible: boolean): void;
  update(elapsedSeconds: number): void;
};

export function createCometHead(color: THREE.ColorRepresentation): CometHead {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 5, roughness: 0.3 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 18), material);
  const light = new THREE.PointLight(color, 12, 10, 2);
  group.add(sphere, light);

  return {
    group,
    setPosition(position) { group.position.copy(position); },
    setVisible(visible) { group.visible = visible; },
    update(elapsedSeconds) {
      const pulse = 1 + 0.16 * Math.sin(elapsedSeconds * 3.2);
      sphere.scale.setScalar(pulse);
      light.intensity = 10 + 4 * Math.sin(elapsedSeconds * 3.2);
      material.emissiveIntensity = 3.4 + 0.9 * Math.sin(elapsedSeconds * 3.2);
    },
  };
}
