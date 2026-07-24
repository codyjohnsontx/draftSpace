import * as THREE from "three";
import type { CanvasElement, ShapeType } from "@/core/elements/types";
import { createShapeMesh } from "@/features/scene3d/shape-mesh";
import { createCometHead, createGlowSegment, type GlowSegment } from "./glow-path";
import { createDiagramLabel } from "./labels";

export const WORLD_COLORS = {
  background: 0xf4f0e6,
  ground: 0xefe9dc,
  dot: 0xe2d3c3,
  ink: 0x292724,
  accent: 0xb85f3f,
} as const;

const PARTICIPANT_COLORS = [0xb85f3f, 0x4f6fa8, 0x3f7f78, 0x7b5f86];
const STAMP = "2026-07-24T00:00:00.000Z";

/**
 * Story windows over scene progress (0..1 across ~8 viewports of scroll).
 * One cast of shapes flows chaos -> clusters -> grid -> architecture diagram,
 * then the diagram is traced by a request and redesigned live.
 */
const SETTLE = [0.08, 0.3] as const; // chaos falls flat, drifts into affinity clusters
const SNAP = [0.36, 0.52] as const; // clusters click onto the grid, staggered
const BUILD = [0.56, 0.68] as const; // grid reflows into the architecture diagram
const TRACE = [0.66, 0.78] as const; // the thread traces one request through the system
const SWOOP = [0.78, 0.84] as const; // collaborator cursors arrive
const DRAG = [0.85, 0.9] as const; // the monolith is pulled apart
const REWIRE = [0.88, 0.95] as const; // the thread re-routes through the split services

function window01(value: number, [start, end]: readonly [number, number]): number {
  return THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Deterministic pseudo-random in [0, 1) so renders are stable across mounts. */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Role =
  | "entry" | "client" | "gateway" | "auth" | "monoA" | "monoB"
  | "cache" | "db" | "queue" | "ensemble";

type CastSpec = {
  role: Role;
  type: ShapeType;
  width: number;
  height: number;
  fill: string | null;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  cornerRadius?: number;
  /** Final architecture position (world units on the ground plane). */
  diagram: { x: number; z: number; y?: number };
};

function element(id: string, spec: CastSpec): CanvasElement {
  const base = {
    id,
    x: 0,
    y: 0,
    width: spec.width,
    height: spec.height,
    rotation: 0,
    groupIds: [],
    locked: false,
    hidden: false,
    opacity: 1,
    strokeColor: spec.stroke ?? "#292724",
    strokeWidth: spec.strokeWidth ?? 3,
    strokeStyle: spec.strokeStyle ?? ("solid" as const),
    fillColor: spec.fill,
    fillStyle: "solid" as const,
    roughness: 1,
    boundTextId: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
  if (spec.type === "rectangle") return { ...base, type: "rectangle", cornerRadius: spec.cornerRadius ?? 14 };
  if (spec.type === "ellipse") return { ...base, type: "ellipse" };
  return { ...base, type: "diamond" };
}

function buildCast(): CastSpec[] {
  const cast: CastSpec[] = [
    { role: "entry", type: "ellipse", width: 130, height: 92, fill: "#f4eadf", diagram: { x: -23, z: 0 } },
    { role: "client", type: "rectangle", width: 120, height: 78, fill: "#fffdfa", diagram: { x: -16, z: -5 } },
    { role: "client", type: "rectangle", width: 120, height: 78, fill: "#fffdfa", diagram: { x: -16, z: 0 } },
    { role: "client", type: "rectangle", width: 120, height: 78, fill: "#fffdfa", diagram: { x: -16, z: 5 } },
    { role: "gateway", type: "rectangle", width: 128, height: 150, fill: "#f4eadf", cornerRadius: 18, diagram: { x: -8, z: 0 } },
    { role: "auth", type: "diamond", width: 124, height: 112, fill: "#d4a72c", diagram: { x: -8, z: 6.6 } },
    { role: "monoA", type: "rectangle", width: 150, height: 96, fill: "#d97757", diagram: { x: 0, z: -1.45 } },
    { role: "monoB", type: "rectangle", width: 150, height: 96, fill: "#d97757", diagram: { x: 0, z: 1.45 } },
    { role: "cache", type: "rectangle", width: 96, height: 70, fill: "#d4a72c", cornerRadius: 12, diagram: { x: 8, z: 4.5 } },
    { role: "db", type: "ellipse", width: 150, height: 108, fill: "#3f7f78", stroke: "#fffdfa", diagram: { x: 8, z: -4, y: 0 } },
    { role: "db", type: "ellipse", width: 150, height: 108, fill: "#3f7f78", stroke: "#fffdfa", diagram: { x: 8, z: -4, y: 0.56 } },
    { role: "db", type: "ellipse", width: 150, height: 108, fill: "#3f7f78", stroke: "#fffdfa", diagram: { x: 8, z: -4, y: 1.12 } },
  ];
  for (let i = 0; i < 4; i += 1) {
    cast.push({ role: "queue", type: "rectangle", width: 70, height: 54, fill: "#fffdfa", cornerRadius: 10, strokeWidth: 2.5, diagram: { x: 15, z: 2.8 + i * 2.4 } });
  }
  // The ensemble: shapes that live through the chaos and get tidied into side piles.
  const paperFills = ["#fffdfa", "#f4eadf", "#efe6d6", "#e9e0cf"];
  const types: ShapeType[] = ["rectangle", "rectangle", "ellipse", "rectangle", "diamond", "ellipse"];
  for (let i = 0; i < 26; i += 1) {
    const type = types[i % types.length];
    const width = 64 + seeded(i, 21) * 96;
    const height = type === "rectangle" ? 48 + seeded(i, 22) * 64 : width * (0.66 + seeded(i, 23) * 0.3);
    const strokeOnly = i % 9 === 4;
    const pile = i % 2 === 0 ? -1 : 1;
    const pileIndex = Math.floor(i / 2);
    const col = pileIndex % 3;
    const row = Math.floor(pileIndex / 3) % 3;
    const layer = Math.floor(pileIndex / 9);
    cast.push({
      role: "ensemble",
      type,
      width,
      height,
      fill: strokeOnly ? null : paperFills[i % paperFills.length],
      strokeWidth: strokeOnly ? 3 : 0,
      strokeStyle: strokeOnly ? "dashed" : "solid",
      cornerRadius: 12,
      diagram: { x: pile * 26 + (col - 1) * 3.4, z: (pile > 0 ? 5 : -7) + row * 3.6, y: layer * 0.45 },
    });
  }
  return cast;
}

type Track = {
  holder: THREE.Group;
  spec: CastSpec;
  chaos: { x: number; z: number; y: number; tiltX: number; tiltZ: number; spin: number; phase: number };
  cluster: { x: number; z: number; spin: number };
  grid: { x: number; z: number };
  snapDelay: number;
  buildDelay: number;
  fillMaterial: THREE.MeshStandardMaterial | null;
  baseEmissive: THREE.Color | null;
  hopU: number | null;
};

type Route = {
  segments: GlowSegment[];
  lengths: number[];
  total: number;
  pointAt(t: number, out: THREE.Vector3): void;
};

function makeRoute(segments: GlowSegment[]): Route {
  const lengths = segments.map((segment) => segment.length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  return {
    segments,
    lengths,
    total,
    pointAt(t, out) {
      let remaining = THREE.MathUtils.clamp(t, 0, 1) * total;
      for (let i = 0; i < segments.length; i += 1) {
        if (remaining <= lengths[i] || i === segments.length - 1) {
          segments[i].curve.getPointAt(THREE.MathUtils.clamp(remaining / lengths[i], 0, 1), out);
          return;
        }
        remaining -= lengths[i];
      }
    },
  };
}

/** Draws a composite route: 0..1 across all segments in order. */
function drawRoute(route: Route, t: number): void {
  let remaining = THREE.MathUtils.clamp(t, 0, 1) * route.total;
  for (let i = 0; i < route.segments.length; i += 1) {
    const fraction = THREE.MathUtils.clamp(remaining / route.lengths[i], 0, 1);
    route.segments[i].setProgress(fraction);
    remaining -= route.lengths[i];
  }
}

export type LandingWorld = {
  group: THREE.Group;
  update(elapsedSeconds: number, sceneProgress: number): void;
};

export function buildLandingWorld(): LandingWorld {
  const group = new THREE.Group();
  group.name = "landing-world";

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 300),
    new THREE.MeshStandardMaterial({ color: WORLD_COLORS.ground, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);

  // ---- The cast -----------------------------------------------------------
  const specs = buildCast();
  const tracks: Track[] = [];

  // Grid order sorted by type then footprint, so the contact sheet reads deliberately.
  const gridOrder = specs
    .map((spec, index) => ({ index, key: `${spec.type === "rectangle" ? 0 : spec.type === "ellipse" ? 1 : 2}-${(1000 - spec.width).toFixed(0)}` }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry, sorted) => ({ index: entry.index, sorted }));
  const gridSlot = new Map(gridOrder.map((entry) => [entry.index, entry.sorted]));

  const clusterCenters: Record<string, [number, number]> = {
    rectangle: [-9, 5],
    ellipse: [8, -6],
    diamond: [3, 10],
  };
  // Golden-angle spiral packing keeps clustered shapes from interpenetrating.
  const clusterCounts: Record<string, number> = { rectangle: 0, ellipse: 0, diamond: 0 };

  specs.forEach((spec, index) => {
    const node = createShapeMesh(element(`cast-${spec.role}-${index}`, spec));
    if (!node) return;
    const holder = new THREE.Group();
    const flat = new THREE.Group();
    flat.rotation.x = -Math.PI / 2;
    node.position.set(0, 0, 0);
    flat.add(node);
    holder.add(flat);
    group.add(holder);

    const angle = seeded(index, 1) * Math.PI * 2;
    // Keep the middle of the stage clear so the hero headline gets air.
    const radius = 11 + seeded(index, 2) ** 1.4 * 21;
    const slot = gridSlot.get(index) ?? index;
    const col = slot % 8;
    const row = Math.floor(slot / 8);
    const [cx, cz] = clusterCenters[spec.type];
    const clusterSlot = clusterCounts[spec.type];
    clusterCounts[spec.type] += 1;
    const clusterRadius = 2.6 * Math.sqrt(clusterSlot + 0.4);
    const clusterAngle = clusterSlot * 2.39996 + seeded(index, 8) * 0.5;

    let fillMaterial: THREE.MeshStandardMaterial | null = null;
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        fillMaterial = mesh.material as THREE.MeshStandardMaterial;
      }
    });
    if (fillMaterial && spec.role !== "ensemble") {
      (fillMaterial as THREE.MeshStandardMaterial).emissive = new THREE.Color((fillMaterial as THREE.MeshStandardMaterial).color);
      (fillMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    }

    tracks.push({
      holder,
      spec,
      chaos: {
        x: Math.cos(angle) * radius * 1.35,
        z: Math.sin(angle) * radius,
        y: 0.7 + seeded(index, 3) * 3.4,
        tiltX: (seeded(index, 4) - 0.5) * 1.15,
        tiltZ: (seeded(index, 5) - 0.5) * 1.15,
        spin: seeded(index, 6) * Math.PI * 2,
        phase: seeded(index, 7) * Math.PI * 2,
      },
      cluster: {
        x: cx + Math.cos(clusterAngle) * clusterRadius * 1.2,
        z: cz + Math.sin(clusterAngle) * clusterRadius,
        spin: (seeded(index, 10) - 0.5) * 0.7,
      },
      grid: { x: (col - 3.5) * 4.4 - 1, z: (row - 2.5) * 4.4 },
      snapDelay: ((col + row) / 12) * 0.55 + seeded(index, 11) * 0.1,
      buildDelay: seeded(index, 12) * 0.35,
      fillMaterial,
      baseEmissive: null,
      hopU: null,
    });
  });

  // ---- The request route --------------------------------------------------
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const seg1 = createGlowSegment([v(-23, 0.4, 2.2), v(-19, 0.4, 0.6), v(-16, 0.45, 0), v(-11.5, 0.4, 0.8), v(-8, 0.45, 0)], { color: WORLD_COLORS.accent });
  const seg2a = createGlowSegment([v(-8, 0.45, 0), v(-3.4, 0.4, -0.5), v(0, 0.5, 0), v(4.2, 0.4, 2.6), v(8, 0.5, 4.5), v(9.4, 0.42, 0.4), v(8, 0.5, -4)], { color: WORLD_COLORS.accent });
  const seg2b = createGlowSegment([v(-8, 0.45, 0), v(-4.2, 0.4, -1.6), v(0, 0.5, -2.9), v(2.6, 0.45, -0.2), v(0.4, 0.5, 2.9), v(4.4, 0.42, 3.9), v(8, 0.5, 4.5), v(9.4, 0.42, 0.4), v(8, 0.5, -4)], { color: WORLD_COLORS.accent });
  const seg3 = createGlowSegment([v(8, 0.5, -4), v(4, 2.4, -6.4), v(-4, 3.1, -6.8), v(-12, 2.5, -4.6), v(-16, 0.6, -0.6)], { color: WORLD_COLORS.accent });
  [seg1, seg2a, seg2b, seg3].forEach((segment) => group.add(segment.mesh));
  const routeA = makeRoute([seg1, seg2a, seg3]);
  const routeB = makeRoute([seg1, seg2b, seg3]);
  const head = createCometHead(WORLD_COLORS.accent);
  head.setVisible(false);
  group.add(head.group);

  // Node pulse anchors: route parameter where the request passes each station.
  const pulseSample = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  for (const track of tracks) {
    if (!["client", "gateway", "monoA", "monoB", "cache", "db", "entry"].includes(track.spec.role)) continue;
    anchor.set(track.spec.diagram.x, 0.45, track.spec.diagram.z);
    let bestU = 0;
    let bestDistance = Infinity;
    for (let s = 0; s <= 160; s += 1) {
      routeA.pointAt(s / 160, pulseSample);
      const distance = pulseSample.distanceTo(anchor);
      if (distance < bestDistance) { bestDistance = distance; bestU = s / 160; }
    }
    track.hopU = bestDistance < 4 ? bestU : null;
  }

  // ---- Diagram labels — the annotations architects pencil next to shapes ----
  // Standard flowchart/system-design vocabulary: terminator ellipse for the
  // actors, rectangles for services, diamond for the decision, cylinder for
  // the database, plus gateway / cache / queue naming.
  const staticLabelSpecs: { text: string; x: number; z: number; color?: string }[] = [
    { text: "USERS", x: -23, z: 2.5 },
    { text: "WEB", x: -16, z: -2.9 },
    { text: "IOS", x: -16, z: 2.1 },
    { text: "ANDROID", x: -16, z: 7.1 },
    { text: "API GATEWAY", x: -8, z: 3.3 },
    { text: "AUTH?", x: -8, z: 9.1, color: "#b85f3f" },
    { text: "CACHE", x: 8, z: 6.6 },
    { text: "DATABASE", x: 8, z: -1.4 },
    { text: "QUEUE", x: 15, z: 0.8 },
  ];
  const staticLabels = staticLabelSpecs.map((spec) => {
    const label = createDiagramLabel(spec.text, spec.color);
    label.mesh.position.set(spec.x, 0.035, spec.z);
    group.add(label.mesh);
    return label;
  });
  const monolithLabel = createDiagramLabel("MONOLITH");
  monolithLabel.mesh.position.set(0, 0.035, 4.35);
  const ordersLabel = createDiagramLabel("ORDERS");
  ordersLabel.mesh.position.set(-4.5, 0.035, -2.9);
  const billingLabel = createDiagramLabel("BILLING");
  billingLabel.mesh.position.set(0, 0.035, 5.45);
  [monolithLabel, ordersLabel, billingLabel].forEach((label) => group.add(label.mesh));

  // ---- Snap dust rings ----------------------------------------------------
  const castCount = tracks.length;
  const ringGeometry = new THREE.RingGeometry(0.85, 1.05, 26);
  ringGeometry.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeometry, new THREE.MeshBasicMaterial({ color: WORLD_COLORS.dot }), castCount);
  rings.frustumCulled = false;
  group.add(rings);

  // ---- Halftone dots along the route --------------------------------------
  const DOT_COUNT = 300;
  const dotGeometry = new THREE.CircleGeometry(0.2, 10);
  dotGeometry.rotateX(-Math.PI / 2);
  const dots = new THREE.InstancedMesh(dotGeometry, new THREE.MeshBasicMaterial({ color: WORLD_COLORS.dot }), DOT_COUNT);
  dots.frustumCulled = false;
  const dotData: { position: THREE.Vector3; u: number; size: number }[] = [];
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const dotPoint = new THREE.Vector3();
  for (let i = 0; i < DOT_COUNT; i += 1) {
    const u = seeded(i, 30) * 0.98 + 0.01;
    routeA.pointAt(u, dotPoint);
    // Perpendicular offset using a coarse tangent estimate.
    routeA.pointAt(Math.min(u + 0.01, 1), tangent);
    tangent.sub(dotPoint).normalize();
    normal.crossVectors(up, tangent).normalize();
    const side = seeded(i, 31) > 0.5 ? 1 : -1;
    const spread = 1 + seeded(i, 32) ** 1.7 * 5;
    const position = dotPoint.clone().addScaledVector(normal, side * spread);
    position.y = 0.02;
    dotData.push({ position, u, size: 0.5 + seeded(i, 33) * 0.9 });
  }
  group.add(dots);

  // ---- Cursors + selection ring -------------------------------------------
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
  const cursorPosts: [number, number][] = [[0, 3.4], [-8, -3.2], [13, 9], [15, -1]];
  const cursors = PARTICIPANT_COLORS.map((color, index) => {
    const mesh = new THREE.Mesh(cursorGeometry, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    mesh.scale.setScalar(1.05);
    mesh.rotation.x = -Math.PI / 2.7;
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.visible = false;
    group.add(holder);
    return { holder, post: cursorPosts[index], phase: index * 1.7, arriveDelay: index * 0.14 };
  });

  const selection = createShapeMesh(element("selection-ring", {
    role: "monoB", type: "rectangle", width: 170, height: 114, fill: null,
    strokeWidth: 2.5, strokeStyle: "dashed", cornerRadius: 16, diagram: { x: 0, z: 0 },
  }));
  const selectionHolder = new THREE.Group();
  if (selection) {
    const flat = new THREE.Group();
    flat.rotation.x = -Math.PI / 2;
    selection.position.set(0, 0, 0);
    flat.add(selection);
    selectionHolder.add(flat);
  }
  selectionHolder.visible = false;
  group.add(selectionHolder);

  // ---- Per-frame choreography ---------------------------------------------
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scaleVector = new THREE.Vector3();
  const positionVector = new THREE.Vector3();
  const headPoint = new THREE.Vector3();
  const HIDDEN = new THREE.Vector3(0, -50, 0);

  function update(elapsedSeconds: number, sceneProgress: number): void {
    const settle = smooth(window01(sceneProgress, SETTLE));
    const snapWindow = window01(sceneProgress, SNAP);
    const buildWindow = window01(sceneProgress, BUILD);
    const trace = smooth(window01(sceneProgress, TRACE));
    const swoop = smooth(window01(sceneProgress, SWOOP));
    const drag = smooth(window01(sceneProgress, DRAG));
    const rewire = smooth(window01(sceneProgress, REWIRE));

    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      const { chaos, cluster, grid, spec } = track;

      // Stage 1: chaos -> cluster. Tilts and altitude go first, drift follows.
      const land = smooth(THREE.MathUtils.clamp(settle * 1.6, 0, 1));
      const drift = smooth(THREE.MathUtils.clamp((settle - 0.35) / 0.65, 0, 1));
      let x = THREE.MathUtils.lerp(chaos.x, cluster.x, drift);
      let z = THREE.MathUtils.lerp(chaos.z, cluster.z, drift);
      const tumble = (1 - land) * 0.1 * Math.sin(elapsedSeconds * 0.55 + chaos.phase);
      let y = THREE.MathUtils.lerp(chaos.y + (1 - land) * 0.3 * Math.sin(elapsedSeconds * 0.8 + chaos.phase), 0, land);
      const tiltX = THREE.MathUtils.lerp(chaos.tiltX + tumble, 0, land);
      const tiltZ = THREE.MathUtils.lerp(chaos.tiltZ - tumble, 0, land);
      let spin = THREE.MathUtils.lerp(chaos.spin, cluster.spin, drift);

      // Overlapping shapes read as stacked paper, not coplanar z-fighting: every
      // shape keeps a hair of unique height, plus a pile lift while clustered.
      const paper = seeded(i, 13);
      y += 0.012 + paper * 0.05;

      // Stage 2: cluster -> grid, staggered snap with a squash on landing.
      const snapT = smooth(THREE.MathUtils.clamp((snapWindow - track.snapDelay) / 0.42, 0, 1));
      y += drift * (1 - snapT) * paper * 0.28;
      x = THREE.MathUtils.lerp(x, grid.x, snapT);
      z = THREE.MathUtils.lerp(z, grid.z, snapT);
      spin = THREE.MathUtils.lerp(spin, 0, snapT);

      // Stage 3: grid -> diagram (cast) or side piles (ensemble), with a mid-flight hop.
      const buildT = smooth(THREE.MathUtils.clamp((buildWindow - track.buildDelay) / 0.6, 0, 1));
      const targetX = spec.diagram.x;
      let targetZ = spec.diagram.z;
      const targetY = spec.diagram.y ?? 0;
      // The refactor: the monolith halves pull apart while a cursor drags one of them.
      if (spec.role === "monoA") targetZ = THREE.MathUtils.lerp(spec.diagram.z, -2.9, drag);
      if (spec.role === "monoB") targetZ = THREE.MathUtils.lerp(spec.diagram.z, 2.9, drag);
      x = THREE.MathUtils.lerp(x, targetX, buildT);
      z = THREE.MathUtils.lerp(z, targetZ, buildT);
      y = THREE.MathUtils.lerp(y, targetY, buildT) + Math.sin(Math.PI * buildT) * 0.9;
      if (spec.role === "monoB") y += Math.sin(Math.PI * drag) * 0.55;

      // Landing squash for the grid snap, then a soft idle breath once assembled.
      const squash = snapT > 0 && snapT < 1 ? 1 - 0.14 * Math.sin(Math.PI * snapT) : 1;
      const breath = buildT >= 1 && spec.role !== "ensemble" ? 1 + 0.008 * Math.sin(elapsedSeconds * 1.4 + i) : 1;

      // The finale is the finished blueprint: the tidied leftovers clear away entirely.
      let clear = 0;
      if (spec.role === "ensemble") {
        clear = smooth(THREE.MathUtils.clamp((window01(sceneProgress, [0.925, 0.985]) - seeded(i, 40) * 0.35) / 0.65, 0, 1));
        y -= clear * 0.3;
      }
      const presence = 1 - clear;

      track.holder.position.set(x, y, z);
      track.holder.rotation.set(tiltX, spin, tiltZ);
      track.holder.scale.set(breath * presence, squash * breath * presence, breath * presence);
      track.holder.visible = presence > 0.001;

      // Queue chips do a little consumer hop after the rewire lands.
      if (spec.role === "queue" && rewire >= 1) {
        const hop = Math.max(0, Math.sin(elapsedSeconds * 2.2 - (spec.diagram.z ?? 0) * 0.6));
        track.holder.position.y = targetY + hop * 0.22;
      }

      // Dust ring keyed to each shape's own snap completion.
      const ringT = THREE.MathUtils.clamp((snapT - 0.72) / 0.28, 0, 1);
      const ringScale = ringT > 0 && ringT < 1 ? Math.sin(Math.PI * ringT) * (0.7 + 1.5 * ringT) : 0.0001;
      positionVector.set(grid.x, 0.04, grid.z);
      scaleVector.setScalar(Math.max(ringScale, 0.0001));
      matrix.compose(ringT > 0 ? positionVector : HIDDEN, quaternion, scaleVector);
      rings.setMatrixAt(i, matrix);
    }
    rings.instanceMatrix.needsUpdate = true;

    // ---- Labels fade in as the diagram assembles; the split renames the halves ----
    staticLabels.forEach((label, index) => {
      label.setOpacity(smooth(THREE.MathUtils.clamp((sceneProgress - 0.625 - index * 0.008) / 0.05, 0, 1)) * 0.85);
    });
    monolithLabel.setOpacity(
      smooth(THREE.MathUtils.clamp((sceneProgress - 0.625) / 0.05, 0, 1)) * (1 - smooth(window01(sceneProgress, [0.845, 0.875]))) * 0.85,
    );
    ordersLabel.setOpacity(rewire * 0.85);
    billingLabel.setOpacity(rewire * 0.85);

    // ---- Thread: trace the request, then re-route it live ----
    drawRoute(routeA, trace);
    if (rewire > 0) {
      // Retract the monolith leg while the split-service leg draws in.
      seg2a.setProgress(1 - rewire);
      seg2b.setProgress(rewire);
    } else {
      seg2b.setProgress(0);
    }

    let headVisible = false;
    if (trace > 0 && trace < 1) {
      routeA.pointAt(trace, headPoint);
      headVisible = true;
    } else if (rewire > 0 && rewire < 1) {
      seg2b.curve.getPointAt(THREE.MathUtils.clamp(rewire, 0.001, 0.999), headPoint);
      headVisible = true;
    } else if (sceneProgress >= 0.955) {
      // Ambient: the finished system keeps running.
      routeB.pointAt((elapsedSeconds * 0.07) % 1, headPoint);
      headVisible = true;
    }
    if (headVisible) head.setPosition(headPoint);
    head.setVisible(headVisible);
    head.update(elapsedSeconds);

    // Node pulses as the request passes each station.
    const activeU = trace > 0 && trace < 1 ? trace : sceneProgress >= 0.955 ? (elapsedSeconds * 0.07) % 1 : null;
    for (const track of tracks) {
      if (!track.fillMaterial || track.spec.role === "ensemble") continue;
      let intensity = 0;
      if (activeU !== null && track.hopU !== null) {
        const distance = Math.abs(activeU - track.hopU);
        intensity = Math.max(0, 1 - distance * 14) * 0.55;
      }
      track.fillMaterial.emissiveIntensity = intensity;
    }

    // Halftone dots pop in just behind the traveling trace.
    for (let i = 0; i < dotData.length; i += 1) {
      const dot = dotData[i];
      const reveal = THREE.MathUtils.clamp((trace - dot.u) * 22, 0, 1);
      scaleVector.setScalar(Math.max(reveal * dot.size, 0.0001));
      matrix.compose(dot.position, quaternion, scaleVector);
      dots.setMatrixAt(i, matrix);
    }
    dots.instanceMatrix.needsUpdate = true;

    // ---- Cursors: arrive, hover, and one of them drags the split ----
    cursors.forEach((cursor, index) => {
      const arrive = smooth(THREE.MathUtils.clamp((swoop - cursor.arriveDelay) / 0.6, 0, 1));
      cursor.holder.visible = arrive > 0.01;
      if (!cursor.holder.visible) return;
      const [px, pz] = cursor.post;
      const hoverX = px + Math.sin(elapsedSeconds * 0.7 + cursor.phase) * 0.7;
      const hoverZ = pz + Math.cos(elapsedSeconds * 0.55 + cursor.phase) * 0.6;
      const fromX = px + 26;
      const fromZ = pz + (index % 2 === 0 ? 14 : -14);
      let cx = THREE.MathUtils.lerp(fromX, hoverX, arrive);
      let cz = THREE.MathUtils.lerp(fromZ, hoverZ, arrive);
      let cy = THREE.MathUtils.lerp(6.5, 1.5, arrive);
      if (index === 0) {
        // The terracotta cursor grabs the second monolith half and pulls it away.
        const grabBlend = drag > 0 ? 1 : smooth(THREE.MathUtils.clamp((sceneProgress - 0.835) / 0.015, 0, 1));
        const grabZ = THREE.MathUtils.lerp(1.45, 2.9, drag) + 0.9;
        cx = THREE.MathUtils.lerp(cx, 1.1, grabBlend);
        cz = THREE.MathUtils.lerp(cz, grabZ, grabBlend);
        cy = THREE.MathUtils.lerp(cy, 1.3, grabBlend); // hovers clear of the box top while gripping
      }
      cursor.holder.position.set(cx, cy, cz);
      cursor.holder.rotation.y = Math.sin(elapsedSeconds * 0.4 + cursor.phase) * 0.3 - 0.5;
    });

    // Selection ring follows the dragged half while the edit is live.
    const selectionVisible = sceneProgress > 0.838 && sceneProgress < 0.945;
    selectionHolder.visible = selectionVisible;
    if (selectionVisible) {
      selectionHolder.position.set(0, 0.05, THREE.MathUtils.lerp(1.45, 2.9, drag));
      const pulse = 1 + 0.02 * Math.sin(elapsedSeconds * 4);
      selectionHolder.scale.setScalar(pulse);
    }
  }

  update(0, 0);
  return { group, update };
}
