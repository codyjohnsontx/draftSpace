import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { disposeObject3D } from "@/features/scene3d/dispose";
import { buildLandingWorld, WORLD_COLORS } from "./world";
import { createCameraRig, type CameraKeyframe } from "./camera-rig";

/**
 * One stage, one story: the camera starts high and off-axis over the chaos,
 * swings while the shapes cluster, and rotates into exact grid alignment at
 * the same moment the shapes snap — then settles in to watch the system run.
 * Beat boundaries land at cumulative section heights over ~8 viewports.
 */
const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  { at: 0.0, position: [17, 23, 29], lookAt: [1, 0, -1] },
  { at: 0.143, position: [-15, 17, 23], lookAt: [2, 0, 1] },
  { at: 0.3, position: [-11, 23, 25], lookAt: [-1, 0, 0] },
  { at: 0.5, position: [0, 24, 27], lookAt: [0, 0, 0] },
  { at: 0.571, position: [0, 21, 26], lookAt: [0, 0, 0] },
  { at: 0.7, position: [6, 15, 23], lookAt: [1, 0, 0] },
  { at: 0.786, position: [11, 11, 17], lookAt: [1, 0.4, 1] },
  { at: 0.92, position: [6, 14, 21], lookAt: [0, 0, 0] },
  { at: 1.0, position: [-3, 31, 40], lookAt: [-3, 0, -0.5] },
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
  scene.fog = new THREE.Fog(WORLD_COLORS.background, 55, 190);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 420);

  const hemisphere = new THREE.HemisphereLight(0xfff9ef, 0xd8cfc0, 1.45);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(-30, 60, 28);
  scene.add(sun);

  const world = buildLandingWorld();
  scene.add(world.group);
  const rig = createCameraRig(camera, CAMERA_KEYFRAMES);

  const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let progress = 0;
  let lastElapsed = 0;

  // Subtle pointer parallax keeps the stage alive between scrolls.
  const parallaxTarget = new THREE.Vector2();
  const parallax = new THREE.Vector2();
  const onPointerMove = (event: PointerEvent) => {
    parallaxTarget.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener("pointermove", onPointerMove);

  function setProgress(next: number): void {
    progress = THREE.MathUtils.clamp(next, 0, 1);
  }

  function render(elapsedSeconds: number): void {
    lastElapsed = elapsedSeconds;
    parallax.lerp(parallaxTarget, 0.05);
    rig.setProgress(progress, parallax.x * 1.15, -parallax.y * 0.65);
    world.update(elapsedSeconds, progress);
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
  rig.setProgress(0);

  function dispose(): void {
    window.removeEventListener("resize", onWindowResize);
    window.removeEventListener("pointermove", onPointerMove);
    clearTimeout(resizeTimer);
    disposeObject3D(scene);
    composer.dispose();
    renderTarget.dispose();
    renderer.dispose();
  }

  return { setProgress, render, resize, dispose };
}
