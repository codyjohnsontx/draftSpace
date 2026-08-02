export type Point = { x: number; y: number };
export type Bounds = { x: number; y: number; width: number; height: number };
export type ElementId = string;
export type ShapeType = "rectangle" | "ellipse" | "diamond";

/** Semantic role of a node in a system diagram; "plain" is an ordinary whiteboard shape. */
export type NodeKind = "plain" | "service" | "datastore" | "queue" | "actor" | "decision" | "boundary";

export type BaseShapeElement = {
  id: ElementId;
  type: ShapeType;
  /** What this shape means in an architecture diagram. */
  nodeKind: NodeKind;
  /** Architectural tier: 0 = data, 1 = services, 2 = edge, 3 = clients. Drawn as height in the 3D view. */
  layer: number;
  /** Short display label rendered in both the 2D and 3D views. */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  groupIds: string[];
  locked: boolean;
  hidden: boolean;
  opacity: number;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  fillColor: string | null;
  fillStyle: "solid" | "hachure";
  roughness: number;
  boundTextId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RectangleElement = BaseShapeElement & {
  type: "rectangle";
  cornerRadius: number;
};

export type EllipseElement = BaseShapeElement & { type: "ellipse" };
export type DiamondElement = BaseShapeElement & { type: "diamond" };

export type CanvasElement = RectangleElement | EllipseElement | DiamondElement;

export type ShapeStylePatch = Partial<Pick<BaseShapeElement,
  "fillColor" | "strokeColor" | "strokeWidth" | "strokeStyle" | "opacity"
>> & { cornerRadius?: number };

export type ConnectorId = string;
export type PortSide = "n" | "e" | "s" | "w";
/** "auto" resolves to the facing port pair at render time, so connectors stay sensible as nodes move. */
export type ConnectorPort = PortSide | "auto";
export type ConnectorEndpoint = { elementId: ElementId; port: ConnectorPort };
export type ConnectorKind = "sync" | "async" | "data";

/** An edge between two shapes. Lives beside elements on the board, not inside the CanvasElement union. */
export type Connector = {
  id: ConnectorId;
  from: ConnectorEndpoint;
  to: ConnectorEndpoint;
  kind: ConnectorKind;
  label: string | null;
  strokeColor: string;
  strokeWidth: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConnectorMutablePatch = Partial<Pick<Connector, "kind" | "label" | "strokeColor" | "strokeWidth" | "locked">>;
