import type { BaseShapeElement, CanvasElement } from "@/core/elements/types";

const STAMP = "2026-07-23T00:00:00.000Z";

const base: Omit<BaseShapeElement, "id" | "type" | "x" | "y" | "width" | "height"> = {
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
  createdAt: STAMP,
  updatedAt: STAMP,
};

/**
 * A small workflow sketch expressed as real board elements — the landing page
 * renders these through createShapeMesh to prove user boards lift into 3D.
 */
export const SAMPLE_BOARD_ELEMENTS: CanvasElement[] = [
  { ...base, id: "sample-start", type: "ellipse", x: 30, y: 120, width: 170, height: 104, fillColor: "#f4eadf" },
  { ...base, id: "sample-collect", type: "rectangle", x: 300, y: 60, width: 210, height: 116, cornerRadius: 20, fillColor: "#fffdfa" },
  { ...base, id: "sample-decide", type: "diamond", x: 600, y: 96, width: 190, height: 168, fillColor: "#d4a72c" },
  { ...base, id: "sample-build", type: "rectangle", x: 320, y: 320, width: 214, height: 116, cornerRadius: 20, fillColor: "#d97757" },
  { ...base, id: "sample-review", type: "ellipse", x: 640, y: 360, width: 160, height: 104, fillColor: "#3f7f78", strokeColor: "#fffdfa" },
  {
    ...base,
    id: "sample-later",
    type: "rectangle",
    x: 40,
    y: 360,
    width: 190,
    height: 104,
    cornerRadius: 14,
    fillColor: null,
    strokeStyle: "dashed",
    opacity: 0.9,
  },
];
