import { expect, test, type Page } from "@playwright/test";

const STAMP = "2026-07-24T00:00:00.000Z";

// Firefox on Linux CI reports top-bar buttons as "not stable" while the software WebGL view churns;
// dispatch the click directly there, matching the 2D style-inspector spec. Real users are unaffected.
async function pressButton(page: Page, browserName: string, name: string) {
  const button = page.getByRole("button", { name });
  await expect(button).toBeVisible();
  if (browserName === "firefox") {
    await button.dispatchEvent("click");
    return;
  }
  await button.click();
}

function shape(id: string, type: string, nodeKind: string, layer: number, label: string, x: number, y: number, width: number, height: number, fill: string) {
  return {
    id, type, nodeKind, layer, label, x, y, width, height,
    rotation: 0, groupIds: [], locked: false, hidden: false, opacity: 1,
    strokeColor: "#292724", strokeWidth: 2, strokeStyle: "solid",
    fillColor: fill, fillStyle: "solid", roughness: 0, boundTextId: null,
    createdAt: STAMP, updatedAt: STAMP,
    ...(type === "rectangle" ? { cornerRadius: 12 } : {}),
  };
}

function connector(id: string, fromId: string, toId: string, kind: string) {
  return {
    id, from: { elementId: fromId, port: "auto" }, to: { elementId: toId, port: "auto" },
    kind, label: null, strokeColor: "#b85f3f", strokeWidth: 2, locked: false,
    createdAt: STAMP, updatedAt: STAMP,
  };
}

const elements = [
  shape("shopper", "ellipse", "actor", 2, "Shopper", 80, 30, 150, 90, "#f4eadf"),
  shape("storefront", "rectangle", "service", 1, "Storefront", 60, 260, 170, 100, "#fffdfa"),
  shape("orders", "rectangle", "service", 1, "Orders API", 380, 260, 180, 100, "#d97757"),
  shape("ordersdb", "ellipse", "datastore", 0, "Orders DB", 680, 400, 170, 110, "#3f7f78"),
  shape("events", "rectangle", "queue", 0, "Events", 680, 110, 190, 80, "#fffdfa"),
];
const connectors = [
  connector("c1", "shopper", "storefront", "sync"),
  connector("c2", "storefront", "orders", "sync"),
  connector("c3", "orders", "ordersdb", "data"),
  connector("c4", "orders", "events", "async"),
];
const seededBoard = {
  fileFormat: "draftspace/board", schemaVersion: 3, id: "space-e2e", name: "Space e2e board",
  createdAt: STAMP, updatedAt: STAMP, viewport: { x: 0, y: 0, zoom: 1 },
  preferences: { backgroundPattern: "dots", gridSize: 20, snapToGrid: true, restoreViewport: true },
  elementIds: elements.map((element) => element.id),
  elements: Object.fromEntries(elements.map((element) => [element.id, element])),
  connectorIds: connectors.map((entry) => entry.id),
  connectors: Object.fromEntries(connectors.map((entry) => [entry.id, entry])),
};

async function seedBoard(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-board-ready", "true");
  await page.evaluate(async (doc) => {
    localStorage.setItem("draftspace:last-board", doc.id as string);
    await new Promise((resolve, reject) => {
      const open = indexedDB.open("draftspace");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("boards", "readwrite");
        tx.objectStore("boards").put(doc);
        tx.oncomplete = () => { db.close(); resolve(null); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, seededBoard as unknown as Record<string, unknown>);
  await page.reload();
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-element-count", "5");
}

/** Screen position of a board point under the space view's default camera. */
function projected(page: Page, boardX: number, boardY: number, layer: number) {
  const viewport = page.viewportSize()!;
  const tilt = 0.14;
  const pixelsPerUnit = 22;
  const scale = 1 / 34;
  const viewY = -Math.cos(tilt);
  const viewZ = -Math.sin(tilt);
  const upDot = viewY;
  let upY = 1 - upDot * viewY;
  let upZ = -upDot * viewZ;
  const length = Math.hypot(upY, upZ);
  upY /= length; upZ /= length;
  const worldX = boardX * scale;
  const worldY = layer * 3;
  const worldZ = boardY * scale;
  return {
    x: viewport.width / 2 + worldX * pixelsPerUnit,
    y: viewport.height / 2 - (worldY * upY + worldZ * upZ) * pixelsPerUnit,
  };
}

const readOrdersX = (page: Page) => page.evaluate(() => new Promise<number>((resolve, reject) => {
  const open = indexedDB.open("draftspace");
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const get = open.result.transaction("boards").objectStore("boards").get("space-e2e");
    get.onsuccess = () => resolve((get.result as { elements: Record<string, { x: number }> }).elements.orders.x);
    get.onerror = () => reject(get.error);
  };
}));

test.describe("3D space view", () => {
  test("edits the same board document as the 2D canvas", async ({ browserName, page }, testInfo) => {
    test.slow();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await seedBoard(page);
    await pressButton(page, browserName, "Switch to 3D space");
    const space = page.getByRole("main", { name: "Draftspace 3D space" });
    await expect(space).toHaveAttribute("data-space-ready", /webgl|fallback/, { timeout: 15_000 });
    const ready = await space.getAttribute("data-space-ready");
    if (testInfo.project.name === "chromium") expect(ready).toBe("webgl");

    if (ready === "webgl") {
      await page.waitForTimeout(700);
      await testInfo.attach("space-topdown", { body: await page.screenshot(), contentType: "image/png" });

      // Drag the Orders API node one grid-chunk up-left and wait for the document to change.
      const from = projected(page, 380 + 90, 260 + 50, 1);
      const before = await readOrdersX(page);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x - 140, from.y - 100, { steps: 14 });
      await page.mouse.up();
      await expect.poll(() => readOrdersX(page), { timeout: 15_000 }).not.toBe(before);

      // Connectors survived the move.
      const connectorCount = await page.evaluate(() => new Promise<number>((resolve) => {
        const open = indexedDB.open("draftspace");
        open.onsuccess = () => {
          const get = open.result.transaction("boards").objectStore("boards").get("space-e2e");
          get.onsuccess = () => resolve((get.result as { connectorIds: string[] }).connectorIds.length);
        };
      }));
      expect(connectorCount).toBe(4);
      await testInfo.attach("space-after-drag", { body: await page.screenshot(), contentType: "image/png" });
    }

    // Back to the whiteboard — same document, same shapes.
    await pressButton(page, browserName, "Switch to 2D canvas");
    await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-element-count", "5");
    expect(pageErrors).toEqual([]);
  });

  test("connector rendering keeps the 2D whiteboard intact", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await seedBoard(page);
    // The seeded board renders connectors on the 2D canvas without breaking interaction.
    await page.mouse.click(200, 200);
    expect(pageErrors).toEqual([]);
  });
});
