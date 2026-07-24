import * as THREE from "three";
import type { BoardDocument } from "@/core/board/types";
import type { CanvasElement, Connector, Point, PortSide } from "@/core/elements/types";
import { routeConnector } from "@/core/connectors/routing";
import { disposeObject3D } from "@/features/scene3d/dispose";
import { createDiagramLabel } from "@/features/scene3d/diagram-label";
import { createNodeMesh, nodePortPositions, SPACE_UNIT_SCALE } from "@/features/scene3d/node-kit";
import { createShapeMesh } from "@/features/scene3d/shape-mesh";

export const TIER_HEIGHT = 3;
const BACKGROUND = 0xf4f0e6;
const ACCENT = 0xb85f3f;

const S = SPACE_UNIT_SCALE;
export const boardToWorld = (point: Point, layer: number): THREE.Vector3 => new THREE.Vector3(point.x * S, layer * TIER_HEIGHT, point.y * S);
export const worldToBoard = (world: THREE.Vector3): Point => ({ x: world.x / S, y: world.z / S });

type NodeRecord = {
  holder: THREE.Group;
  mesh: THREE.Group;
  label: ReturnType<typeof createDiagramLabel> | null;
  key: string;
  element: CanvasElement;
};

type ConnectorRecord = { mesh: THREE.Mesh; key: string };

export type SpaceView = { tilt: number; azimuth: number; targetX: number; targetZ: number; pixelsPerUnit: number };

export type PickResult =
  | { kind: "node"; elementId: string }
  | { kind: "port"; elementId: string; side: PortSide }
  | null;

/** Geometry-affecting element fields; a change here forces a mesh rebuild. */
function nodeKey(element: CanvasElement): string {
  return [
    element.type, element.nodeKind, element.width, element.height, element.label,
    element.fillColor, element.strokeColor, element.strokeWidth, element.strokeStyle,
    element.opacity, element.type === "rectangle" ? element.cornerRadius : 0, element.hidden,
  ].join("|");
}

function nodeTopHeight(element: CanvasElement): number {
  if (element.nodeKind === "datastore") return 2.1;
  if (element.nodeKind === "service") return 0.85;
  return 0.7;
}

export type SpaceScene = {
  syncBoard(board: BoardDocument): void;
  setSelection(ids: readonly string[]): void;
  setHovered(elementId: string | null): void;
  setView(view: Partial<SpaceView>): void;
  getView(): SpaceView;
  /** Live position override during a drag, in board coordinates. */
  setDragPreview(elementId: string, position: Point | null): void;
  setConnectGhost(from: { elementId: string; side: PortSide } | null, toWorld?: THREE.Vector3 | null): void;
  pick(ndc: THREE.Vector2): PickResult;
  /** Intersects the pointer ray with the horizontal plane at a tier height. */
  groundPoint(ndc: THREE.Vector2, tierY: number): THREE.Vector3 | null;
  resize(): void;
  dispose(): void;
};

export function createSpaceScene(canvas: HTMLCanvasElement): SpaceScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.3;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.Fog(BACKGROUND, 160, 420);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
  const hemisphere = new THREE.HemisphereLight(0xfff9ef, 0xd8cfc0, 1.45);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(-40, 70, 30);
  scene.add(hemisphere, sun);

  const grid = new THREE.GridHelper(400, 200, 0xded5c4, 0xe9e2d3);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.4;
  grid.position.y = -0.02;
  scene.add(grid);

  const nodesGroup = new THREE.Group();
  const connectorsGroup = new THREE.Group();
  const tiersGroup = new THREE.Group();
  scene.add(nodesGroup, connectorsGroup, tiersGroup);

  // Selection ring + hover ports are singletons repositioned onto the active node.
  const selectionRings = new Map<string, THREE.Group>();
  const portMaterial = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.5, emissive: ACCENT, emissiveIntensity: 0.25 });
  const portGeometry = new THREE.SphereGeometry(0.28, 14, 14);
  const portHandles: THREE.Mesh[] = Array.from({ length: 4 }, () => {
    const handle = new THREE.Mesh(portGeometry, portMaterial);
    handle.visible = false;
    scene.add(handle);
    return handle;
  });

  const ghostMaterial = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.8 });
  const ghostGeometry = new THREE.BufferGeometry();
  const ghostLine = new THREE.Line(ghostGeometry, ghostMaterial);
  ghostLine.visible = false;
  scene.add(ghostLine);

  const nodes = new Map<string, NodeRecord>();
  const connectorMeshes = new Map<string, ConnectorRecord>();
  const dragPreview = new Map<string, Point>();
  let currentBoard: BoardDocument | null = null;
  let hoveredId: string | null = null;
  let selectedIds: readonly string[] = [];
  let connectFrom: { elementId: string; side: PortSide } | null = null;

  const view: SpaceView = { tilt: 0.14, azimuth: 0, targetX: 0, targetZ: 0, pixelsPerUnit: 22 };

  function elementPosition(element: CanvasElement): Point {
    return dragPreview.get(element.id) ?? { x: element.x, y: element.y };
  }

  function placeNode(record: NodeRecord): void {
    const element = record.element;
    const position = elementPosition(element);
    const centerX = (position.x + element.width / 2) * S;
    const centerZ = (position.y + element.height / 2) * S;
    const jitter = (element.id.charCodeAt(0) % 7) * 0.008;
    record.holder.position.set(centerX, element.layer * TIER_HEIGHT + jitter, centerZ);
  }

  function buildNode(element: CanvasElement): NodeRecord | null {
    const mesh = createNodeMesh(element);
    if (!mesh) return null;
    const holder = new THREE.Group();
    holder.userData.elementId = element.id;
    const flat = new THREE.Group();
    flat.rotation.x = -Math.PI / 2;
    flat.add(mesh);
    holder.add(flat);
    let label: NodeRecord["label"] = null;
    if (element.label) {
      label = createDiagramLabel(element.label, "#44403a");
      label.mesh.position.y = nodeTopHeight(element) + 0.04;
      const maxWidth = element.width * S * 0.92;
      const labelWidth = (label.mesh.geometry as THREE.PlaneGeometry).parameters.width;
      if (labelWidth > maxWidth) label.mesh.scale.setScalar(maxWidth / labelWidth);
      label.setOpacity(0.9);
      holder.add(label.mesh);
    }
    nodesGroup.add(holder);
    const record: NodeRecord = { holder, mesh, label, key: nodeKey(element), element };
    placeNode(record);
    return record;
  }

  function removeNode(id: string): void {
    const record = nodes.get(id);
    if (!record) return;
    nodesGroup.remove(record.holder);
    disposeObject3D(record.holder);
    nodes.delete(id);
  }

  /** Lifts a board-space polyline into 3D, ramping height between the endpoint tiers. */
  function liftPolyline(points: Point[], fromLayer: number, toLayer: number): THREE.Vector3[] {
    const lengths: number[] = [0];
    for (let index = 1; index < points.length; index += 1) {
      lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
    }
    const total = lengths[lengths.length - 1] || 1;
    const surface = 0.35;
    return points.map((point, index) => {
      const t = lengths[index] / total;
      const layer = THREE.MathUtils.lerp(fromLayer, toLayer, THREE.MathUtils.smoothstep(t, 0.15, 0.85));
      return new THREE.Vector3(point.x * S, layer * TIER_HEIGHT + surface, point.y * S);
    });
  }

  function connectorKey(connector: Connector, from: CanvasElement, to: CanvasElement): string {
    const fromPosition = elementPosition(from);
    const toPosition = elementPosition(to);
    return [
      connector.kind, connector.strokeColor, connector.strokeWidth,
      connector.from.elementId, connector.from.port, connector.to.elementId, connector.to.port,
      fromPosition.x, fromPosition.y, from.width, from.height, from.layer,
      toPosition.x, toPosition.y, to.width, to.height, to.layer,
    ].join("|");
  }

  function buildConnectorMesh(connector: Connector, from: CanvasElement, to: CanvasElement): THREE.Mesh | null {
    const fromPosition = elementPosition(from);
    const toPosition = elementPosition(to);
    const points = routeConnector(
      { ...fromPosition, width: from.width, height: from.height },
      { ...toPosition, width: to.width, height: to.height },
      connector,
    );
    if (points.length < 2) return null;
    const lifted = liftPolyline(points, from.layer, to.layer);
    const curve = new THREE.CatmullRomCurve3(lifted, false, "catmullrom", 0.08);
    const geometry = new THREE.TubeGeometry(curve, Math.max(lifted.length * 10, 32), 0.09, 8, false);
    const material = new THREE.MeshStandardMaterial({
      color: connector.strokeColor,
      roughness: 0.6,
      transparent: connector.kind === "async",
      opacity: connector.kind === "async" ? 0.65 : 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.connectorId = connector.id;
    // Arrow cone at the destination.
    const tip = lifted[lifted.length - 1];
    const previous = lifted[lifted.length - 2];
    const direction = tip.clone().sub(previous).normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.62, 12), material);
    cone.position.copy(tip).addScaledVector(direction, -0.28);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    mesh.add(cone);
    return mesh;
  }

  function syncConnectors(board: BoardDocument, onlyTouching?: Set<string>): void {
    const seen = new Set<string>();
    for (const id of board.connectorIds) {
      const connector = board.connectors[id];
      if (!connector) continue;
      const from = board.elements[connector.from.elementId];
      const to = board.elements[connector.to.elementId];
      if (!from || !to || from.hidden || to.hidden) continue;
      seen.add(id);
      if (onlyTouching && !onlyTouching.has(connector.from.elementId) && !onlyTouching.has(connector.to.elementId) && connectorMeshes.has(id)) continue;
      const key = connectorKey(connector, from, to);
      const existing = connectorMeshes.get(id);
      if (existing && existing.key === key) continue;
      if (existing) {
        connectorsGroup.remove(existing.mesh);
        disposeObject3D(existing.mesh);
      }
      const mesh = buildConnectorMesh(connector, from, to);
      if (mesh) {
        connectorsGroup.add(mesh);
        connectorMeshes.set(id, { mesh, key });
      } else {
        connectorMeshes.delete(id);
      }
    }
    for (const [id, record] of connectorMeshes) {
      if (seen.has(id)) continue;
      connectorsGroup.remove(record.mesh);
      disposeObject3D(record.mesh);
      connectorMeshes.delete(id);
    }
  }

  function syncTiers(board: BoardDocument): void {
    tiersGroup.clear();
    const layers = new Set<number>();
    for (const id of board.elementIds) {
      const element = board.elements[id];
      if (element && !element.hidden && element.layer > 0) layers.add(element.layer);
    }
    for (const layer of layers) {
      const slab = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.MeshBasicMaterial({ color: 0xe4dbc8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      );
      slab.rotation.x = -Math.PI / 2;
      slab.position.y = layer * TIER_HEIGHT - 0.05;
      tiersGroup.add(slab);
    }
    tiersGroup.visible = view.tilt > 0.3;
  }

  function syncSelection(): void {
    const wanted = new Set(selectedIds);
    for (const [id, ring] of selectionRings) {
      if (wanted.has(id) && nodes.has(id)) continue;
      ring.parent?.remove(ring);
      disposeObject3D(ring);
      selectionRings.delete(id);
    }
    for (const id of wanted) {
      const record = nodes.get(id);
      if (!record || selectionRings.has(id)) continue;
      const element = record.element;
      const ring = createShapeMesh({
        ...element,
        id: `selection-${id}`,
        type: "rectangle",
        x: -(element.width + 26) / 2,
        y: -(element.height + 26) / 2,
        width: element.width + 26,
        height: element.height + 26,
        cornerRadius: 16,
        fillColor: null,
        strokeColor: "#b85f3f",
        strokeWidth: 2,
        strokeStyle: "dashed",
        opacity: 1,
        hidden: false,
      } as CanvasElement);
      if (!ring) continue;
      const flat = new THREE.Group();
      flat.rotation.x = -Math.PI / 2;
      flat.position.y = 0.06;
      flat.add(ring);
      record.holder.add(flat);
      selectionRings.set(id, flat);
    }
  }

  function syncPorts(): void {
    const record = hoveredId ? nodes.get(hoveredId) : null;
    if (!record || record.element.nodeKind === "boundary") {
      portHandles.forEach((handle) => { handle.visible = false; });
      return;
    }
    const ports = nodePortPositions(record.element);
    ports.forEach((port, index) => {
      const handle = portHandles[index];
      handle.visible = true;
      handle.position.set(
        record.holder.position.x + port.localX,
        record.holder.position.y + 0.4,
        record.holder.position.z + port.localZ,
      );
      handle.userData.elementId = record.element.id;
      handle.userData.side = port.side;
    });
  }

  function applyCamera(): void {
    const distance = 220;
    const tilt = THREE.MathUtils.clamp(view.tilt, 0.08, 1.15);
    const target = new THREE.Vector3(view.targetX, 0, view.targetZ);
    camera.position.set(
      target.x + distance * Math.sin(tilt) * Math.sin(view.azimuth),
      target.y + distance * Math.cos(tilt),
      target.z + distance * Math.sin(tilt) * Math.cos(view.azimuth),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.left = -width / 2 / view.pixelsPerUnit;
    camera.right = width / 2 / view.pixelsPerUnit;
    camera.top = height / 2 / view.pixelsPerUnit;
    camera.bottom = -height / 2 / view.pixelsPerUnit;
    camera.updateProjectionMatrix();
    tiersGroup.visible = view.tilt > 0.3;
  }

  const raycaster = new THREE.Raycaster();

  function pick(ndc: THREE.Vector2): PickResult {
    raycaster.setFromCamera(ndc, camera);
    const portHit = raycaster.intersectObjects(portHandles.filter((handle) => handle.visible), false)[0];
    if (portHit) return { kind: "port", elementId: portHit.object.userData.elementId, side: portHit.object.userData.side };
    const hits = raycaster.intersectObjects(nodesGroup.children, true);
    for (const hit of hits) {
      let target: THREE.Object3D | null = hit.object;
      while (target && !target.userData.elementId) target = target.parent;
      if (target?.userData.elementId) return { kind: "node", elementId: target.userData.elementId };
    }
    return null;
  }

  function groundPoint(ndc: THREE.Vector2, tierY: number): THREE.Vector3 | null {
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -tierY);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, point) ? point : null;
  }

  let frame = 0;
  const renderLoop = () => {
    frame = requestAnimationFrame(renderLoop);
    renderer.render(scene, camera);
  };

  function resize(): void {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    applyCamera();
  }

  resize();
  renderLoop();

  return {
    syncBoard(board) {
      currentBoard = board;
      const seen = new Set<string>();
      for (const id of board.elementIds) {
        const element = board.elements[id];
        if (!element || element.hidden) continue;
        seen.add(id);
        const existing = nodes.get(id);
        const key = nodeKey(element);
        if (existing && existing.key === key) {
          existing.element = element;
          placeNode(existing);
          continue;
        }
        if (existing) removeNode(id);
        const record = buildNode(element);
        if (record) nodes.set(id, record);
      }
      for (const id of [...nodes.keys()]) if (!seen.has(id)) removeNode(id);
      syncConnectors(board);
      syncTiers(board);
      syncSelection();
      syncPorts();
    },
    setSelection(ids) {
      selectedIds = ids;
      syncSelection();
    },
    setHovered(elementId) {
      if (hoveredId === elementId) return;
      hoveredId = elementId;
      syncPorts();
    },
    setView(next) {
      Object.assign(view, next);
      applyCamera();
      syncPorts();
    },
    getView: () => ({ ...view }),
    setDragPreview(elementId, position) {
      if (position) dragPreview.set(elementId, position);
      else dragPreview.delete(elementId);
      const record = nodes.get(elementId);
      if (record && currentBoard) {
        placeNode(record);
        syncConnectors(currentBoard, new Set([elementId]));
        syncPorts();
      }
    },
    setConnectGhost(from, toWorld) {
      connectFrom = from;
      if (!from || !toWorld || !currentBoard) {
        ghostLine.visible = false;
        return;
      }
      const record = nodes.get(from.elementId);
      if (!record) { ghostLine.visible = false; return; }
      const ports = nodePortPositions(record.element);
      const port = ports.find((entry) => entry.side === from.side) ?? ports[0];
      const start = new THREE.Vector3(record.holder.position.x + port.localX, record.holder.position.y + 0.4, record.holder.position.z + port.localZ);
      ghostGeometry.setFromPoints([start, toWorld]);
      ghostLine.visible = true;
    },
    pick,
    groundPoint,
    resize,
    dispose() {
      cancelAnimationFrame(frame);
      void connectFrom;
      disposeObject3D(scene);
      renderer.dispose();
    },
  };
}
