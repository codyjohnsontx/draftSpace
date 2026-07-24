import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { disposeObject3D } from "@/features/scene3d/dispose";
import { buildLandingWorld, WORLD_COLORS } from "./world";
import { createGlowPath, pathProgressFor } from "./glow-path";
import { createCameraRig, type CameraKeyframe } from "./camera-rig";

/** One framing per section boundary; sections are 100svh so boundaries land at i/5. */
const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  { at: 0.0, position: [-20, 33, 46], lookAt: [10, 0, -3] },
  { at: 0.2, position: [-12, 15, 25], lookAt: [0, 0.5, -1] },
  { at: 0.4, position: [21, 13, 10], lookAt: [34.5, 0.8, -7.5] },
  { at: 0.6, position: [54, 17, 24], lookAt: [68, 0, 6] },
  { at: 0.8, position: [88, 10, 8], lookAt: [100, 1, -5.5] },
  { at: 1.0, position: [38, 60, 68], lookAt: [52, 0, 0] },
];

export type LandingScene = {
  setProgress(progress: number): void;
  render(elapsedSeconds: number): void;
  resize(): void;
  dispose(): void;
};

/** Throws if a WebGL context cannot be created — callers fall back to static styling. */
export function createLandingScene(canvas: HTMLCanvasElement): LandingScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.3;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD_COLORS.background);
  scene.fog = new THREE.Fog(WORLD_COLORS.background, 62, 240);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 420);

  const hemisphere = new THREE.HemisphereLight(0xfff9ef, 0xd8cfc0, 1.45);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(-30, 60, 28);
  scene.add(sun);

  const world = buildLandingWorld();
  scene.add(world.group);
  const glowPath = createGlowPath(world.pathPoints, WORLD_COLORS.accent);
  scene.add(glowPath.group);
  const rig = createCameraRig(camera, CAMERA_KEYFRAMES);

  const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let progress = 0;
  let lastElapsed = 0;

  function setProgress(next: number): void {
    progress = THREE.MathUtils.clamp(next, 0, 1);
    rig.setProgress(progress);
    glowPath.setProgress(pathProgressFor(progress));
  }

  function render(elapsedSeconds: number): void {
    lastElapsed = elapsedSeconds;
    world.update(elapsedSeconds, progress);
    glowPath.update(elapsedSeconds);
    composer.render();
  }

  function resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    composer.setSize(width, height);
    render(lastElapsed);
  }

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onWindowResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  };
  window.addEventListener("resize", onWindowResize);

  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  composer.setSize(width, height);
  setProgress(0);

  function dispose(): void {
    window.removeEventListener("resize", onWindowResize);
    clearTimeout(resizeTimer);
    disposeObject3D(scene);
    composer.dispose();
    renderTarget.dispose();
    renderer.dispose();
  }

  return { setProgress, render, resize, dispose };
}
