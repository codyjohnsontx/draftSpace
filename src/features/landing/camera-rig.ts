import * as THREE from "three";

export type CameraKeyframe = {
  /** Scene progress (0..1) at which this framing is exact. */
  at: number;
  position: [number, number, number];
  lookAt: [number, number, number];
};

export type CameraRig = { setProgress(progress: number): void };

/**
 * Flies the camera through art-directed keyframes: two CatmullRom curves (one
 * through positions, one through lookAt targets) give designed framing at each
 * section boundary with continuous motion between them. Segment-local smoothing
 * makes the camera dwell near each stop.
 */
export function createCameraRig(camera: THREE.PerspectiveCamera, keyframes: CameraKeyframe[]): CameraRig {
  const frames = [...keyframes].sort((a, b) => a.at - b.at);
  const positionCurve = new THREE.CatmullRomCurve3(frames.map((k) => new THREE.Vector3(...k.position)), false, "centripetal");
  const lookAtCurve = new THREE.CatmullRomCurve3(frames.map((k) => new THREE.Vector3(...k.lookAt)), false, "centripetal");
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  const segmentCount = frames.length - 1;

  function toCurveT(progress: number): number {
    const p = THREE.MathUtils.clamp(progress, frames[0].at, frames[segmentCount].at);
    let index = 0;
    while (index < segmentCount - 1 && p > frames[index + 1].at) index += 1;
    const span = frames[index + 1].at - frames[index].at;
    const local = span > 0 ? (p - frames[index].at) / span : 0;
    return (index + THREE.MathUtils.smoothstep(local, 0, 1)) / segmentCount;
  }

  function setProgress(progress: number): void {
    const t = toCurveT(progress);
    positionCurve.getPoint(t, position);
    lookAtCurve.getPoint(t, target);
    camera.position.copy(position);
    camera.lookAt(target);
  }

  setProgress(0);
  return { setProgress };
}
