import * as THREE from "three";
import type { CanvasElement, PortSide } from "@/core/elements/types";
import { PORT_SIDES, portPoint } from "@/core/connectors/ports";
import { createShapeMesh, SHAPE_MESH_DEFAULTS } from "./shape-mesh";

export const SPACE_UNIT_SCALE = SHAPE_MESH_DEFAULTS.unitScale;

/**
 * Recenters an element so the factory places its mesh at the local origin;
 * the space view positions the parent holder from the element's board center.
 */
function centered(element: CanvasElement, overrides: Partial<CanvasElement> = {}): CanvasElement {
  const width = (overrides.width ?? element.width);
  const height = (overrides.height ?? element.height);
  return { ...element, ...overrides, x: -width / 2, y: -height / 2, width, height } as CanvasElement;
}

/**
 * Builds the 3D mesh for a node in its local frame: shape in the XY plane,
 * extrusion toward +Z, centered at the origin. Kind-specific recipes stack or
 * split the base footprint; everything still renders through createShapeMesh,
 * so user styling (fill, stroke, dash, opacity) carries into every kind.
 */
export function createNodeMesh(element: CanvasElement): THREE.Group | null {
  if (element.hidden) return null;

  if (element.nodeKind === "datastore") {
    const group = new THREE.Group();
    const thickness = 0.5;
    for (let slice = 0; slice < 3; slice += 1) {
      const disk = createShapeMesh(centered({ ...element, type: "ellipse" } as CanvasElement), { thickness });
      if (!disk) continue;
      disk.position.z += slice * thickness * 1.3;
      group.add(disk);
    }
    return group;
  }

  if (element.nodeKind === "queue") {
    const group = new THREE.Group();
    const gap = element.width * 0.06;
    const chipWidth = (element.width - gap * 2) / 3;
    for (let chip = 0; chip < 3; chip += 1) {
      const piece = createShapeMesh(centered(element, { width: chipWidth, type: "rectangle" } as Partial<CanvasElement>), { thickness: 0.42 });
      if (!piece) continue;
      piece.position.x += (chip - 1) * (chipWidth + gap) * SPACE_UNIT_SCALE;
      group.add(piece);
    }
    return group;
  }

  if (element.nodeKind === "boundary") {
    const slab = createShapeMesh(centered(element), { thickness: 0.08 });
    if (!slab) return null;
    const group = new THREE.Group();
    group.add(slab);
    return group;
  }

  const thickness = element.nodeKind === "service" ? 0.58 : element.nodeKind === "actor" ? 0.35 : SHAPE_MESH_DEFAULTS.thickness;
  const base = createShapeMesh(centered(element), { thickness });
  if (!base) return null;
  const group = new THREE.Group();
  group.add(base);
  return group;
}

export type NodePort = { side: PortSide; localX: number; localZ: number };

/** Port anchor positions in the node's local ground frame (x right, z toward the viewer). */
export function nodePortPositions(element: Pick<CanvasElement, "width" | "height">): NodePort[] {
  const bounds = { x: -element.width / 2, y: -element.height / 2, width: element.width, height: element.height };
  return PORT_SIDES.map((side) => {
    const point = portPoint(bounds, side);
    return { side, localX: point.x * SPACE_UNIT_SCALE, localZ: point.y * SPACE_UNIT_SCALE };
  });
}
