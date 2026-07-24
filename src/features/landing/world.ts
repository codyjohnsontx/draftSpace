import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import type { CanvasElement } from "@/core/elements/types";
import { createShapeMesh } from "@/features/scene3d/shape-mesh";
import { SAMPLE_BOARD_ELEMENTS } from "@/features/scene3d/sample-board";
import { createPathCurve, pathProgressFor } from "./glow-path";

export const WORLD_COLORS = {
  background: 0xf4f0e6,
  ground: 0xefe9dc,
  tile: 0xfbf8f1,
  clutter: 0xe9e1d1,
  dot: 0xe2d3c3,
  ink: 0x292724,
  accent: 0xb85f3f,
} as const;

const PARTICIPANT_COLORS = [0xb85f3f, 0x4f6fa8, 0x3f7f78, 0x7b5f86];

const ISLAND_B = new THREE.Vector3(34, 0, -8);
const ISLAND_C = new THREE.Vector3(68, 0, 7);
const ISLAND_D = new THREE.Vector3(100, 0, -6);

const TILE_COUNT_X = 14;
const TILE_COUNT_Z = 14;
const TILE_SPACING = 3.05;
const DOT_COUNT = 620;

function smooth01(value: number, start: number, end: number): number {
  return THREE.MathUtils.smoothstep(value, start, end);
}

function backOut(t: number): number {
  const s = 1.4;
  const inv = t - 1;
  return 1 + inv * inv * ((s + 1) * inv + s);
}

/** Deterministic pseudo-random in [0, 1) so renders are stable across mounts. */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export type LandingWorld = {
  group: THREE.Group;
  pathPoints: THREE.Vector3[];
  update(elapsedSeconds: number, sceneProgress: number): void;
};

export function buildLandingWorld(): LandingWorld {
  const group = new THREE.Group();
  group.name = "landing-world";

  const pathPoints = [
    new THREE.Vector3(-7, 0.32, 7),
    new THREE.Vector3(11, 0.32, 8),
    new THREE.Vector3(23, 0.32, -4),
    new THREE.Vector3(ISLAND_B.x, 0.32, ISLAND_B.z - 1),
    new THREE.Vector3(46, 0.32, 2),
    new THREE.Vector3(57, 0.32, 12),
    new THREE.Vector3(ISLAND_C.x, 0.32, ISLAND_C.z),
    new THREE.Vector3(80, 0.32, -2),
    new THREE.Vector3(92, 0.32, -9),
    new THREE.Vector3(ISLAND_D.x, 0.42, ISLAND_D.z + 1),
    new THREE.Vector3(109, 0.32, -1),
  ];
  const pathCurve = createPathCurve(pathPoints);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 360),
    new THREE.MeshStandardMaterial({ color: WORLD_COLORS.ground, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(52, -0.02, 0);
  group.add(ground);

  // Island A — the sample board rendered through the shared element→3D factory
  const boardGroup = new THREE.Group();
  boardGroup.name = "island-board";
  boardGroup.rotation.x = -Math.PI / 2;
  const boardShapes: { node: THREE.Group; phase: number; order: number }[] = [];
  const boardCenter = new THREE.Vector2(420 / 34, -260 / 34);
  SAMPLE_BOARD_ELEMENTS.forEach((element, index) => {
    const node = createShapeMesh(element);
    if (!node) return;
    node.position.x -= boardCenter.x;
    node.position.y -= boardCenter.y;
    boardShapes.push({ node, phase: seeded(index, 1) * Math.PI * 2, order: index });
    boardGroup.add(node);
  });
  group.add(boardGroup);

  // Island B — workflow node cards (factory rectangles) with ink header bars
  const cardsGroup = new THREE.Group();
  cardsGroup.name = "island-cards";
  cardsGroup.position.copy(ISLAND_B);
  const cardSpecs = [
    { x: -7.5, z: -3.2, w: 150, fill: "#fffdfa" },
    { x: -1.2, z: 2.6, w: 168, fill: "#f4eadf" },
    { x: 4.9, z: -4.4, w: 150, fill: "#fffdfa" },
    { x: 8.4, z: 3.4, w: 138, fill: "#d97757" },
    { x: 1.6, z: -0.6, w: 158, fill: "#fffdfa" },
  ];
  const headerGeometry = new THREE.BoxGeometry(1, 0.16, 0.5);
  const headerMaterial = new THREE.MeshStandardMaterial({ color: WORLD_COLORS.ink, roughness: 0.9 });
  const cards: { node: THREE.Group; index: number }[] = [];
  cardSpecs.forEach((spec, index) => {
    const element: CanvasElement = {
      id: `card-${index}`,
      type: "rectangle",
      x: 0,
      y: 0,
      width: spec.w,
      height: 96,
      cornerRadius: 12,
      rotation: 0,
      groupIds: [],
      locked: false,
      hidden: false,
      opacity: 1,
      strokeColor: "#292724",
      strokeWidth: 2.5,
      strokeStyle: "solid",
      fillColor: spec.fill,
      fillStyle: "solid",
      roughness: 1,
      boundTextId: null,
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    const card = createShapeMesh(element);
    if (!card) return;
    const holder = new THREE.Group();
    holder.rotation.x = -Math.PI / 2;
    card.position.set(0, 0, 0);
    holder.add(card);
    const header = new THREE.Mesh(headerGeometry, headerMaterial);
    header.scale.x = (spec.w / 34) * 0.72;
    header.position.set(0, 0.66, -96 / 34 / 2 + 0.78);
    holder.add(header);
    holder.position.set(spec.x, 0, spec.z);
    cards.push({ node: holder, index });
    cardsGroup.add(holder);
  });
  group.add(cardsGroup);

  // Island C — instanced tile grid that ripples in as the path arrives
  const tileGeometry = new RoundedBoxGeometry(2.5, 0.5, 2.5, 2, 0.16);
  const tileMaterial = new THREE.MeshStandardMaterial({ color: WORLD_COLORS.tile, roughness: 0.95 });
  const tileCount = TILE_COUNT_X * TILE_COUNT_Z;
  const tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, tileCount);
  tiles.name = "island-tiles";
  const tileOrigins: THREE.Vector3[] = [];
  const tileDistances: number[] = [];
  const gridEntry = new THREE.Vector3(ISLAND_C.x - (TILE_COUNT_X / 2) * TILE_SPACING, 0, ISLAND_C.z);
  let maxTileDistance = 0;
  for (let ix = 0; ix < TILE_COUNT_X; ix += 1) {
    for (let iz = 0; iz < TILE_COUNT_Z; iz += 1) {
      const x = ISLAND_C.x + (ix - (TILE_COUNT_X - 1) / 2) * TILE_SPACING;
      const z = ISLAND_C.z + (iz - (TILE_COUNT_Z - 1) / 2) * TILE_SPACING;
      const origin = new THREE.Vector3(x, 0.25, z);
      tileOrigins.push(origin);
      const distance = origin.distanceTo(gridEntry);
      tileDistances.push(distance);
      maxTileDistance = Math.max(maxTileDistance, distance);
    }
  }
  tiles.frustumCulled = false;
  group.add(tiles);

  // A raised terracotta chip at the grid center — the brand mark's little accent
  const centerChip = new THREE.Mesh(
    new RoundedBoxGeometry(2.5, 0.9, 2.5, 2, 0.16),
    new THREE.MeshStandardMaterial({ color: WORLD_COLORS.accent, roughness: 0.9 }),
  );
  centerChip.name = "grid-center-chip";
  centerChip.position.set(ISLAND_C.x + TILE_SPACING / 2, 0.45, ISLAND_C.z + TILE_SPACING / 2);
  group.add(centerChip);

  // Island D — cursor flock orbiting a shared shape
  const cursorsGroup = new THREE.Group();
  cursorsGroup.name = "island-cursors";
  cursorsGroup.position.copy(ISLAND_D);
  const sharedElement: CanvasElement = {
    id: "shared-shape",
    type: "ellipse",
    x: 0,
    y: 0,
    width: 190,
    height: 130,
    rotation: 0,
    groupIds: [],
    locked: false,
    hidden: false,
    opacity: 1,
    strokeColor: "#292724",
    strokeWidth: 2.5,
    strokeStyle: "solid",
    fillColor: "#f4eadf",
    fillStyle: "solid",
    roughness: 1,
    boundTextId: null,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
  const sharedShape = createShapeMesh(sharedElement);
  if (sharedShape) {
    const holder = new THREE.Group();
    holder.rotation.x = -Math.PI / 2;
    sharedShape.position.set(0, 0, 0);
    holder.add(sharedShape);
    cursorsGroup.add(holder);
  }

  const cursorShape = new THREE.Shape();
  cursorShape.moveTo(0, 0);
  cursorShape.lineTo(1.05, -0.78);
  cursorShape.lineTo(0.62, -0.86);
  cursorShape.lineTo(0.85, -1.38);
  cursorShape.lineTo(0.63, -1.47);
  cursorShape.lineTo(0.4, -0.95);
  cursorShape.lineTo(0.12, -1.26);
  cursorShape.closePath();
  const cursorGeometry = new THREE.ExtrudeGeometry(cursorShape, { depth: 0.14, bevelEnabled: false });
  const cursors: { node: THREE.Group; angle: number; speed: number }[] = [];
  PARTICIPANT_COLORS.forEach((color, index) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const mesh = new THREE.Mesh(cursorGeometry, material);
    mesh.scale.setScalar(1.3);
    mesh.rotation.x = -Math.PI / 2.7;
    const holder = new THREE.Group();
    holder.add(mesh);
    cursors.push({ node: holder, angle: (index / PARTICIPANT_COLORS.length) * Math.PI * 2, speed: 0.28 + index * 0.05 });
    cursorsGroup.add(holder);
  });
  group.add(cursorsGroup);

  // Ground clutter — merged flat chips scattered off the path corridor
  const clutterPieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 46; i += 1) {
    const w = 1 + seeded(i, 3) * 2.4;
    const d = 1 + seeded(i, 4) * 2.4;
    const piece = new RoundedBoxGeometry(w, 0.3, d, 1, 0.12);
    const x = -20 + seeded(i, 5) * 150;
    const z = (seeded(i, 6) - 0.5) * 2 * (16 + seeded(i, 7) * 18);
    const offset = Math.abs(z) < 13 ? Math.sign(z || 1) * 13 : z;
    piece.translate(x, 0.15, offset);
    clutterPieces.push(piece);
  }
  const clutter = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(clutterPieces),
    new THREE.MeshStandardMaterial({ color: WORLD_COLORS.clutter, roughness: 1 }),
  );
  clutter.name = "clutter";
  clutterPieces.forEach((piece) => piece.dispose());
  group.add(clutter);

  // Halftone dots along the path, revealed as the glowing head passes
  const dotGeometry = new THREE.CircleGeometry(0.24, 10);
  dotGeometry.rotateX(-Math.PI / 2);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: WORLD_COLORS.dot });
  const dots = new THREE.InstancedMesh(dotGeometry, dotMaterial, DOT_COUNT);
  dots.name = "path-dots";
  const dotData: { position: THREE.Vector3; u: number; size: number }[] = [];
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < DOT_COUNT; i += 1) {
    const u = seeded(i, 8) * 0.98 + 0.01;
    const point = pathCurve.getPointAt(u);
    pathCurve.getTangentAt(u, tangent);
    normal.crossVectors(up, tangent).normalize();
    const side = seeded(i, 9) > 0.5 ? 1 : -1;
    const spread = 1.1 + seeded(i, 10) ** 1.6 * 6.5;
    const position = point.clone().addScaledVector(normal, side * spread);
    position.y = 0.02;
    dotData.push({ position, u, size: 0.45 + seeded(i, 11) * 0.85 });
  }
  dots.frustumCulled = false;
  group.add(dots);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scaleVector = new THREE.Vector3();
  const positionVector = new THREE.Vector3();

  function update(elapsedSeconds: number, sceneProgress: number): void {
    const pathProgress = pathProgressFor(sceneProgress);

    // Island A: shapes float at the hero, settle as the camera dives in
    const settle = smooth01(sceneProgress, 0.05, 0.22);
    boardShapes.forEach((entry) => {
      const lift = (1 - settle) * (1.7 + entry.order * 0.34);
      const bob = (1 - settle) * 0.22 * Math.sin(elapsedSeconds * 1.25 + entry.phase);
      entry.node.position.z = lift + Math.max(bob, -lift);
    });

    // Island B: cards pop up as the path head approaches
    cards.forEach((card) => {
      const start = 0.3 + card.index * 0.024;
      const t = smooth01(sceneProgress, start, start + 0.075);
      const scale = Math.max(backOut(t), 0.0001);
      card.node.scale.setScalar(scale);
      card.node.visible = t > 0.001;
    });

    // Island C: tile wave synced to path arrival
    const wave = smooth01(sceneProgress, 0.47, 0.68);
    const waveFront = THREE.MathUtils.lerp(-6, maxTileDistance + 8, wave);
    for (let i = 0; i < tileOrigins.length; i += 1) {
      const appear = THREE.MathUtils.clamp((waveFront - tileDistances[i]) / 7, 0, 1);
      const origin = tileOrigins[i];
      const idle = appear >= 1 ? 0.05 * Math.sin(elapsedSeconds * 1.6 + tileDistances[i] * 0.4) : 0;
      const overshoot = Math.sin(Math.min(appear, 1) * Math.PI) * 0.35;
      const y = -0.85 + appear * 1.1 + overshoot + idle;
      scaleVector.setScalar(Math.max(appear, 0.0001));
      positionVector.set(origin.x, y, origin.z);
      matrix.compose(positionVector, quaternion, scaleVector);
      tiles.setMatrixAt(i, matrix);
    }
    tiles.instanceMatrix.needsUpdate = true;
    const chipT = smooth01(sceneProgress, 0.58, 0.68);
    centerChip.scale.setScalar(Math.max(backOut(chipT), 0.0001));
    centerChip.visible = chipT > 0.001;

    // Island D: cursors swoop in and orbit the shared shape
    const swoop = smooth01(sceneProgress, 0.68, 0.82);
    cursors.forEach((cursor, index) => {
      const angle = cursor.angle + elapsedSeconds * cursor.speed;
      const radius = THREE.MathUtils.lerp(20, 4.6 + index * 0.55, backOut(swoop) * 0.96);
      const height = THREE.MathUtils.lerp(7.5, 1.15, swoop);
      cursor.node.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      cursor.node.rotation.y = -angle - Math.PI / 4;
      cursor.node.visible = sceneProgress > 0.55;
    });

    // Halftone dots pop in just behind the traveling head
    for (let i = 0; i < dotData.length; i += 1) {
      const dot = dotData[i];
      const reveal = THREE.MathUtils.clamp((pathProgress - dot.u) * 26, 0, 1);
      scaleVector.setScalar(Math.max(reveal * dot.size, 0.0001));
      matrix.compose(dot.position, quaternion, scaleVector);
      dots.setMatrixAt(i, matrix);
    }
    dots.instanceMatrix.needsUpdate = true;
  }

  update(0, 0);
  return { group, pathPoints, update };
}
