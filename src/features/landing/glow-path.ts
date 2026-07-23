import * as THREE from "three";

const TUBULAR_SEGMENTS = 640;
const RADIAL_SEGMENTS = 8;
const INDICES_PER_SEGMENT = RADIAL_SEGMENTS * 6;

/** Scene progress window in which the path draws itself (before/after it stays empty/full). */
const PATH_START = 0.14;
const PATH_END = 0.88;

export function pathProgressFor(sceneProgress: number): number {
  return THREE.MathUtils.clamp((sceneProgress - PATH_START) / (PATH_END - PATH_START), 0, 1);
}

export function createPathCurve(points: THREE.Vector3[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
}

export type GlowPath = {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  setProgress(pathProgress: number): void;
  update(elapsedSeconds: number): void;
};

export function createGlowPath(points: THREE.Vector3[], accent: THREE.ColorRepresentation): GlowPath {
  const group = new THREE.Group();
  group.name = "glow-path";
  const curve = createPathCurve(points);

  const tubeGeometry = new THREE.TubeGeometry(curve, TUBULAR_SEGMENTS, 0.11, RADIAL_SEGMENTS, false);
  const tubeMaterial = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: accent,
    emissiveIntensity: 2.6,
    roughness: 0.4,
  });
  const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
  tube.frustumCulled = false;
  tubeGeometry.setDrawRange(0, 0);
  group.add(tube);

  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: accent,
    emissiveIntensity: 5,
    roughness: 0.3,
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 18), headMaterial);
  const headLight = new THREE.PointLight(accent, 12, 10, 2);
  head.add(headLight);
  group.add(head);

  let progress = 0;
  const headPosition = new THREE.Vector3();

  function setProgress(pathProgress: number): void {
    progress = THREE.MathUtils.clamp(pathProgress, 0, 1);
    tubeGeometry.setDrawRange(0, Math.floor(progress * TUBULAR_SEGMENTS) * INDICES_PER_SEGMENT);
    curve.getPointAt(progress, headPosition);
    head.position.copy(headPosition);
  }

  function update(elapsedSeconds: number): void {
    const pulse = 1 + 0.16 * Math.sin(elapsedSeconds * 3.2);
    head.scale.setScalar(pulse);
    headLight.intensity = 10 + 4 * Math.sin(elapsedSeconds * 3.2);
    headMaterial.emissiveIntensity = 3.4 + 0.9 * Math.sin(elapsedSeconds * 3.2);
  }

  setProgress(0);
  return { group, curve, setProgress, update };
}
