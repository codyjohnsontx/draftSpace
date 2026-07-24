import * as THREE from "three";

const LABEL_HEIGHT = 0.68; // world units
const FONT_PX = 84;
const INK = "#6b6459";

export type DiagramLabel = {
  mesh: THREE.Mesh;
  setOpacity(opacity: number): void;
};

/**
 * A diagram annotation lying flat on the board, drawn with the site's mono
 * face — the labels system designers pencil next to boxes and cylinders.
 */
export function createDiagramLabel(text: string, color: string = INK): DiagramLabel {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";
  const font = `600 ${FONT_PX}px ${family}`;
  const tracking = FONT_PX * 0.18;

  function draw(): void {
    if (!context) return;
    context.font = font;
    const chars = [...text.toUpperCase()];
    const widths = chars.map((char) => context.measureText(char).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(chars.length - 1, 0);
    canvas.width = Math.ceil(total + FONT_PX * 0.4);
    canvas.height = Math.ceil(FONT_PX * 1.35);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = font;
    context.textBaseline = "middle";
    context.fillStyle = color;
    let x = FONT_PX * 0.2;
    chars.forEach((char, index) => {
      context.fillText(char, x, canvas.height / 2 + FONT_PX * 0.04);
      x += widths[index] + tracking;
    });
  }

  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false });
  const mesh = new THREE.Mesh(buildGeometry(canvas), material);
  mesh.visible = false;

  // Redraw once webfonts land so the mono face replaces the fallback.
  document.fonts?.ready
    .then(() => {
      draw();
      texture.needsUpdate = true;
      mesh.geometry.dispose();
      mesh.geometry = buildGeometry(canvas);
    })
    .catch(() => {});

  return {
    mesh,
    setOpacity(opacity) {
      material.opacity = opacity;
      mesh.visible = opacity > 0.01;
    },
  };
}

function buildGeometry(canvas: HTMLCanvasElement): THREE.PlaneGeometry {
  const aspect = canvas.width / Math.max(canvas.height, 1);
  const geometry = new THREE.PlaneGeometry(LABEL_HEIGHT * aspect, LABEL_HEIGHT);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
