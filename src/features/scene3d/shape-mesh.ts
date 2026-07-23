import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { CanvasElement, ShapeType } from "@/core/elements/types";

export type ShapeMeshOptions = {
  /** World units per board pixel. */
  unitScale?: number;
  /** Extrusion depth in world units. */
  thickness?: number;
};

export const SHAPE_MESH_DEFAULTS = { unitScale: 1 / 34, thickness: 0.42 } as const;

const STROKE_POINT_COUNT = 72;

/** 3D twin of shapePath() — the same outlines, centered at the origin in the XY plane. */
function shapeOutline(type: ShapeType, width: number, height: number, cornerRadius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;

  if (type === "rectangle") {
    const r = Math.min(cornerRadius, hw, hh);
    if (r <= 0) {
      shape.moveTo(-hw, -hh);
      shape.lineTo(hw, -hh);
      shape.lineTo(hw, hh);
      shape.lineTo(-hw, hh);
    } else {
      shape.moveTo(-hw + r, -hh);
      shape.lineTo(hw - r, -hh);
      shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
      shape.lineTo(hw, hh - r);
      shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
      shape.lineTo(-hw + r, hh);
      shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
      shape.lineTo(-hw, -hh + r);
      shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
    }
    shape.closePath();
    return shape;
  }

  if (type === "ellipse") {
    shape.absellipse(0, 0, hw, hh, 0, Math.PI * 2, false, 0);
    return shape;
  }

  shape.moveTo(0, hh);
  shape.lineTo(hw, 0);
  shape.lineTo(0, -hh);
  shape.lineTo(-hw, 0);
  shape.closePath();
  return shape;
}

/**
 * Builds a 3D mesh group for a board element. The shape lies in the local XY
 * plane (board y-down mapped to y-up) and extrudes toward +Z; the group is
 * positioned at the element's center so a whole board doc lays out verbatim.
 * Callers orient the parent (e.g. rotation.x = -PI/2 to rest on the ground).
 * v1 maps solid fills only — fillStyle "hachure" and roughness are deferred
 * to the /space prototype.
 */
export function createShapeMesh(element: CanvasElement, options: ShapeMeshOptions = {}): THREE.Group | null {
  if (element.hidden) return null;

  const unitScale = options.unitScale ?? SHAPE_MESH_DEFAULTS.unitScale;
  const thickness = options.thickness ?? SHAPE_MESH_DEFAULTS.thickness;
  const width = element.width * unitScale;
  const height = element.height * unitScale;
  const cornerRadius = element.type === "rectangle" ? element.cornerRadius * unitScale : 0;
  const transparent = element.opacity < 1;

  const group = new THREE.Group();
  group.name = `shape:${element.id}`;
  const shape = shapeOutline(element.type, width, height, cornerRadius);
  const bevelThickness = thickness * 0.16;

  if (element.fillColor) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness,
      bevelSize: thickness * 0.12,
      bevelSegments: 2,
      curveSegments: 24,
    });
    const material = new THREE.MeshStandardMaterial({
      color: element.fillColor,
      roughness: 0.95,
      metalness: 0,
      transparent,
      opacity: element.opacity,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = bevelThickness;
    group.add(mesh);
  }

  if (element.strokeWidth > 0) {
    const strokeZ = element.fillColor ? thickness + bevelThickness * 2 + 0.015 : 0.015;
    const points = shape.getPoints(STROKE_POINT_COUNT);
    if (points.length > 1 && !points[0].equals(points[points.length - 1])) points.push(points[0].clone());
    const positions: number[] = [];
    for (const point of points) positions.push(point.x, point.y, strokeZ);
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    const strokeWidthWorld = Math.max(element.strokeWidth * unitScale, 0.02);
    const material = new LineMaterial({
      color: new THREE.Color(element.strokeColor).getHex(),
      linewidth: strokeWidthWorld,
      worldUnits: true,
      dashed: element.strokeStyle !== "solid",
      transparent,
      opacity: element.opacity,
    });
    if (element.strokeStyle === "dashed") {
      material.dashSize = strokeWidthWorld * 3;
      material.gapSize = strokeWidthWorld * 2;
    } else if (element.strokeStyle === "dotted") {
      material.dashSize = strokeWidthWorld * 0.9;
      material.gapSize = strokeWidthWorld * 1.7;
    }
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    group.add(line);
  }

  group.position.set((element.x + element.width / 2) * unitScale, -(element.y + element.height / 2) * unitScale, 0);
  group.rotation.z = -element.rotation;
  return group;
}
