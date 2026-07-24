import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import type { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { CanvasElement, RectangleElement } from "@/core/elements/types";
import { createShapeMesh, SHAPE_MESH_DEFAULTS } from "@/features/scene3d/shape-mesh";

function element(overrides: Omit<Partial<RectangleElement>, "type"> & { type?: CanvasElement["type"] } = {}): CanvasElement {
  return {
    id: "test-shape",
    type: "rectangle",
    x: 100,
    y: 60,
    width: 170,
    height: 102,
    cornerRadius: 12,
    rotation: 0,
    groupIds: [],
    locked: false,
    hidden: false,
    opacity: 1,
    strokeColor: "#292724",
    strokeWidth: 3,
    strokeStyle: "solid",
    fillColor: "#fffdfa",
    fillStyle: "solid",
    roughness: 1,
    boundTextId: null,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...overrides,
  } as CanvasElement;
}

function meshesOf(group: THREE.Group) {
  return group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && !(child instanceof Line2));
}

function strokesOf(group: THREE.Group) {
  return group.children.filter((child): child is Line2 => child instanceof Line2);
}

describe("createShapeMesh", () => {
  it("builds a fill mesh plus stroke outline for each shape type", () => {
    for (const type of ["rectangle", "ellipse", "diamond"] as const) {
      const group = createShapeMesh(element({ type }));
      expect(group, type).not.toBeNull();
      expect(meshesOf(group!)).toHaveLength(1);
      expect(strokesOf(group!)).toHaveLength(1);
    }
  });

  it("skips hidden elements", () => {
    expect(createShapeMesh(element({ hidden: true }))).toBeNull();
  });

  it("renders stroke-only when fillColor is null", () => {
    const group = createShapeMesh(element({ fillColor: null }));
    expect(group).not.toBeNull();
    expect(meshesOf(group!)).toHaveLength(0);
    expect(strokesOf(group!)).toHaveLength(1);
  });

  it("omits the stroke when strokeWidth is zero", () => {
    const group = createShapeMesh(element({ strokeWidth: 0 }));
    expect(strokesOf(group!)).toHaveLength(0);
    expect(meshesOf(group!)).toHaveLength(1);
  });

  it("maps fill and stroke styling onto materials", () => {
    const group = createShapeMesh(element({ fillColor: "#d97757", strokeStyle: "dashed", opacity: 0.5 }));
    const fill = meshesOf(group!)[0].material as THREE.MeshStandardMaterial;
    expect(fill.color.getHexString()).toBe("d97757");
    expect(fill.transparent).toBe(true);
    expect(fill.opacity).toBeCloseTo(0.5);
    const stroke = strokesOf(group!)[0].material as LineMaterial;
    expect(stroke.dashed).toBe(true);
    expect(stroke.opacity).toBeCloseTo(0.5);
  });

  it("positions the group at the element center scaled to world units", () => {
    const scale = 1 / 50;
    const group = createShapeMesh(element({ x: 100, y: 60, width: 170, height: 102 }), { unitScale: scale });
    expect(group!.position.x).toBeCloseTo((100 + 85) * scale);
    expect(group!.position.y).toBeCloseTo(-(60 + 51) * scale);
  });

  it("applies element rotation about the extrusion axis", () => {
    const group = createShapeMesh(element({ rotation: Math.PI / 4 }));
    expect(group!.rotation.z).toBeCloseTo(-Math.PI / 4);
  });

  it("honors user-changed cornerRadius by generating distinct geometry", () => {
    const sharp = createShapeMesh(element({ cornerRadius: 0 }));
    const round = createShapeMesh(element({ cornerRadius: 24 }));
    const sharpCount = (meshesOf(sharp!)[0].geometry as THREE.BufferGeometry).attributes.position.count;
    const roundCount = (meshesOf(round!)[0].geometry as THREE.BufferGeometry).attributes.position.count;
    expect(roundCount).toBeGreaterThan(sharpCount);
  });

  it("exposes stable defaults for reuse by the /space prototype", () => {
    expect(SHAPE_MESH_DEFAULTS.unitScale).toBeGreaterThan(0);
    expect(SHAPE_MESH_DEFAULTS.thickness).toBeGreaterThan(0);
  });
});
