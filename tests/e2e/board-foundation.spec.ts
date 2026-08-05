import { expect, test, type Page } from "@playwright/test";

test("explains every toolbar control consistently", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  const controls = [
    ["Select", "Select, move, and resize objects"],
    ["Hand", "Pan around the canvas"],
    ["Rectangle", "Draw a rectangle"],
    ["Ellipse", "Draw an ellipse"],
    ["Diamond", "Draw a diamond"],
    ["Connector", "Drag from one object to another to join them"],
    ["Tool lock", "Keep a drawing tool active"],
    ["Zoom out", "See more of the board"],
    ["Reset zoom to 100%", "Return to 100% zoom"],
    ["Zoom in", "Get a closer view"],
    ["Zoom to fit", "Fit every object"],
    ["Change background pattern", "Cycle dots, grid, and plain"],
    ["Snap to grid", "Click to align objects"],
    ["Undo", "Reverse the last board change"],
    ["Redo", "Restore the last undone change"],
    ["Inspector layout", "Choose floating, right sidebar, or hidden"],
    ["Export", "Download options arrive"],
    ["Help and keyboard shortcuts", "Shortcut reference"],
  ] as const;
  const renderedTooltipCount = () => page.locator('[role="tooltip"]').evaluateAll((tooltips) => tooltips.filter((tooltip) => { const style = getComputedStyle(tooltip); return style.visibility === "visible" && Number.parseFloat(style.opacity) > .99; }).length);
  expect(await renderedTooltipCount()).toBe(0);
  for (const [buttonName, tooltipText] of controls) {
    const button = page.getByRole("button", { name: buttonName });
    await button.hover();
    expect(await button.getAttribute("title"), `${buttonName} should not use a native title`).toBeNull();
    expect(await button.getAttribute("aria-describedby"), `${buttonName} should describe its tooltip`).toBeTruthy();
    const tooltip = page.getByRole("tooltip").filter({ hasText: tooltipText });
    expect(await tooltip.evaluate((element) => ({ opacity: getComputedStyle(element).opacity, visibility: getComputedStyle(element).visibility })), `${buttonName} tooltip should render immediately`).toEqual({ opacity: "1", visibility: "visible" });
    expect(await renderedTooltipCount(), `${buttonName} should be the only rendered tooltip`).toBe(1);
  }
  await page.mouse.move(640, 360);
  await page.getByRole("button", { name: "Rectangle" }).focus();
  await expect(page.getByRole("tooltip").filter({ hasText: "Draw a rectangle" })).toHaveCSS("visibility", "visible");
  expect(await renderedTooltipCount()).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("tooltips-drawing-rail.png") });
  await page.getByRole("button", { name: "Zoom out" }).hover();
  await page.screenshot({ path: testInfo.outputPath("tooltips-viewport-edge.png") });
  await page.getByRole("button", { name: "Help and keyboard shortcuts" }).hover();
  await page.screenshot({ path: testInfo.outputPath("tooltips-topbar-edge.png") });
  await page.setViewportSize({ width: 600, height: 700 });
  const boardMenu = page.getByRole("button", { name: "Board menu" });
  await boardMenu.hover();
  await expect(page.getByRole("tooltip").filter({ hasText: "Board options" })).toHaveCSS("visibility", "visible");
  expect(await renderedTooltipCount()).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("tooltips-mobile-edge.png") });
});

test("creates, moves, undoes, and restores a rectangle", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.keyboard.press("r");
  await page.mouse.move(260, 180); await page.mouse.down(); await page.mouse.move(460, 300); await page.mouse.up();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect(page.getByText("Start with a shape")).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z");
  await page.mouse.click(700, 420);
  await expect.poll(() => page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    if (!context) return null;
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;
    return Array.from(context.getImageData(Math.round(360 * scaleX), Math.round(220 * scaleY), 1, 1).data);
  })).toEqual([244, 234, 223, 255]);
  await page.screenshot({ path: testInfo.outputPath("draftspace-phase1.png") });
  await page.waitForTimeout(700); await page.reload();
  await expect(page.getByText("Start with a shape")).toHaveCount(0);
});

test("creates, selects, and restores ellipses and diamonds", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();

  await page.getByRole("button", { name: "Ellipse" }).click();
  await expect(page.getByRole("button", { name: "Ellipse" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(250, 170); await page.mouse.down(); await page.mouse.move(410, 290); await page.mouse.up();
  await expect(page.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("d");
  await expect(page.getByRole("button", { name: "Diamond" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(500, 170); await page.mouse.down(); await page.mouse.move(660, 290); await page.mouse.up();
  await expect(page.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");

  await page.mouse.click(520, 185);
  await expect(page.locator("[data-resize-handle]")).toHaveCount(0);
  await page.mouse.click(580, 230);
  await expect(page.locator("[data-resize-handle]")).toHaveCount(8);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+Shift+z");

  await page.waitForTimeout(800);
  const storedTypes = await page.evaluate(async () => new Promise<string[]>((resolve, reject) => {
    const id = localStorage.getItem("draftspace:last-board"); const request = indexedDB.open("draftspace");
    request.onerror = () => reject(request.error); request.onsuccess = () => {
      const database = request.result; const get = database.transaction("boards").objectStore("boards").get(id!);
      get.onsuccess = () => { database.close(); resolve(get.result.elementIds.map((elementId: string) => get.result.elements[elementId].type)); };
      get.onerror = () => { database.close(); reject(get.error); };
    };
  }));
  expect(storedTypes).toEqual(["ellipse", "diamond", "diamond"]);
  await page.reload();
  await expect(page.getByText("Start with a shape")).toHaveCount(0);
});

test("migrates a version one rectangle board in place", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.keyboard.press("r");
  await page.mouse.move(260, 180); await page.mouse.down(); await page.mouse.move(420, 280); await page.mouse.up();
  await page.waitForTimeout(800);
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const id = localStorage.getItem("draftspace:last-board"); const request = indexedDB.open("draftspace");
    request.onerror = () => reject(request.error); request.onsuccess = () => {
      const database = request.result; const transaction = database.transaction("boards", "readwrite"); const store = transaction.objectStore("boards"); const get = store.get(id!);
      get.onsuccess = () => store.put({ ...get.result, schemaVersion: 1 });
      transaction.oncomplete = () => { database.close(); resolve(); }; transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  }));
  await page.reload();
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => new Promise<number>((resolve, reject) => {
    const id = localStorage.getItem("draftspace:last-board"); const request = indexedDB.open("draftspace");
    request.onerror = () => reject(request.error); request.onsuccess = () => {
      const database = request.result; const get = database.transaction("boards").objectStore("boards").get(id!);
      get.onsuccess = () => { database.close(); resolve(get.result.schemaVersion); }; get.onerror = () => { database.close(); reject(get.error); };
    };
  }))).toBe(3);
});

test("cancels drawing without changing history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.keyboard.press("r");
  await page.mouse.move(280, 220); await page.mouse.down(); await page.mouse.move(480, 340);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(page.getByText("Start with a shape")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("restores the saved viewport", async ({ page }) => {
  await page.goto("/");
  const zoom = page.getByRole("button", { name: "Reset zoom to 100%" });
  await expect(zoom).toHaveText("100%");
  await page.keyboard.down("Control"); await page.mouse.move(640, 360); await page.mouse.wheel(0, -240); await page.keyboard.up("Control");
  await expect(zoom).not.toHaveText("100%");
  await page.keyboard.press("h");
  await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(770, 450); await page.mouse.up();
  const savedZoom = await zoom.textContent();
  await page.waitForTimeout(1100);
  const savedViewport = await page.evaluate(async () => new Promise<{ x: number; y: number; zoom: number }>((resolve, reject) => {
    const id = localStorage.getItem("draftspace:last-board"); const request = indexedDB.open("draftspace");
    request.onerror = () => reject(request.error); request.onsuccess = () => {
      const database = request.result; const get = database.transaction("boards").objectStore("boards").get(id!);
      get.onsuccess = () => { database.close(); resolve(get.result.viewport); }; get.onerror = () => { database.close(); reject(get.error); };
    };
  }));
  expect(Math.abs(savedViewport.x) + Math.abs(savedViewport.y)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Reset zoom to 100%" })).toHaveText(savedZoom ?? "");
});

test("flushes the viewport when the document becomes hidden", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reset zoom to 100%" })).toHaveText("100%");
  await page.keyboard.down("Control"); await page.mouse.move(640, 360); await page.mouse.wheel(0, -240); await page.keyboard.up("Control");
  await expect(page.getByRole("button", { name: "Reset zoom to 100%" })).not.toHaveText("100%");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => page.evaluate(async () => new Promise<number>((resolve, reject) => {
    const id = localStorage.getItem("draftspace:last-board"); const request = indexedDB.open("draftspace");
    request.onerror = () => reject(request.error); request.onsuccess = () => {
      const db = request.result; const get = db.transaction("boards").objectStore("boards").get(id!);
      get.onsuccess = () => { db.close(); resolve(get.result?.viewport?.zoom ?? 0); }; get.onerror = () => { db.close(); reject(get.error); };
    };
  }))).toBeGreaterThan(1);
});

test("preserves a corrupt board and offers recovery", async ({ browserName, page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  const damagedId = await page.evaluate(() => localStorage.getItem("draftspace:last-board"));
  expect(damagedId).toBeTruthy();
  await page.evaluate(async (id) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("draftspace", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result; const transaction = db.transaction("boards", "readwrite");
        transaction.objectStore("boards").put({ id, fileFormat: "draftspace/board", schemaVersion: 1, updatedAt: new Date().toISOString(), damaged: true });
        transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => reject(transaction.error);
      };
    });
  }, damagedId);
  await page.reload();
  await expect(page.getByRole("heading", { name: "We couldn’t open this board" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath("draftspace-recovery.png") });
  const activateRecoveryAction = async (name: "Download raw data" | "Start a new board") => {
    const button = page.getByRole("button", { name });
    // GitHub-hosted Firefox can misroute pointer coordinates on this screen; the other engines retain pointer coverage.
    // Re-evaluate after Playwright or Firefox upgrades and restore click() when CI pointer coordinates are reliable.
    if (browserName === "firefox") await button.press("Enter");
    else await button.click();
  };
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    activateRecoveryAction("Download raw data"),
  ]);
  expect(download.suggestedFilename()).toContain("draftspace-recovery");
  await activateRecoveryAction("Start a new board");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  const originalStillExists = await page.evaluate(async (id) => new Promise<boolean>((resolve, reject) => {
    const request = indexedDB.open("draftspace", 1); request.onerror = () => reject(request.error); request.onsuccess = () => {
      const db = request.result; const get = db.transaction("boards").objectStore("boards").get(id!); get.onsuccess = () => { db.close(); resolve(Boolean(get.result?.damaged)); }; get.onerror = () => reject(get.error);
    };
  }), damagedId);
  expect(originalStillExists).toBe(true);
});

test("keeps the canvas usable without IndexedDB", async ({ browserName, page }, testInfo) => {
  await page.addInitScript(() => {
    const availableStorage = globalThis.indexedDB; let enabled = false;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, get: () => enabled ? availableStorage : undefined });
    Object.defineProperty(globalThis, "__enableDraftspaceStorage", { configurable: true, value: () => { enabled = true; } });
  });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  const activateStorageAction = async (name: "Not saving" | "Retry storage") => {
    const button = page.getByRole("button", { name });
    await expect(button).toBeVisible();
    // Match the recovery-action workaround above; re-evaluate after Playwright or Firefox upgrades.
    if (browserName === "firefox") await button.press("Enter");
    else await button.click();
  };
  await activateStorageAction("Not saving");
  await expect(page.getByRole("dialog", { name: "Local storage unavailable" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: testInfo.outputPath("draftspace-session-only.png") });
  await expect(page.getByRole("button", { name: "Retry storage" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download backup" })).toBeVisible();
  await page.evaluate(() => (globalThis as typeof globalThis & { __enableDraftspaceStorage: () => void }).__enableDraftspaceStorage());
  await activateStorageAction("Retry storage");
  await expect(page.getByText("Saved locally")).toBeVisible();
});

test("wires two shapes together, previews the edge, and undoes in one step", async ({ page }, testInfo) => {
  const canvas = page.getByRole("main", { name: "Draftspace infinite canvas" });
  const storedConnectors = () => page.evaluate(async () => new Promise<{ from: { elementId: string; port: string }; to: { elementId: string; port: string } }[]>((resolve, reject) => {
    const id = localStorage.getItem("draftspace:last-board"); const request = indexedDB.open("draftspace");
    request.onerror = () => reject(request.error); request.onsuccess = () => {
      const database = request.result; const get = database.transaction("boards").objectStore("boards").get(id!);
      get.onsuccess = () => { database.close(); resolve(get.result ? get.result.connectorIds.map((connectorId: string) => get.result.connectors[connectorId]) : []); };
      get.onerror = () => { database.close(); reject(get.error); };
    };
  }));

  await page.goto("/");
  await expect(canvas).toBeVisible();
  for (const left of [220, 560]) {
    await page.keyboard.press("r");
    await page.mouse.move(left, 200); await page.mouse.down(); await page.mouse.move(left + 140, 300, { steps: 5 }); await page.mouse.up();
  }
  await expect.poll(() => canvas.getAttribute("data-element-count")).toBe("2");

  await page.keyboard.press("c");
  await expect(page.getByRole("button", { name: "Connector" })).toHaveAttribute("aria-pressed", "true");
  // Anchors land where resize handles do, so the frame gets out of the way of the tool that uses them.
  await expect(page.locator("[data-resize-handle]")).toHaveCount(0);

  // Hovering a shape shows the four anchors an edge could leave from.
  await page.mouse.move(290, 250, { steps: 4 });
  await expect(page.locator(".connector-port")).toHaveCount(4);

  // A drag from the east anchor to the second rectangle previews the edge before it commits.
  await page.mouse.move(360, 250); await page.mouse.down(); await page.mouse.move(500, 250, { steps: 10 });
  await expect(page.locator(".connector-draft")).toHaveCount(1);
  expect(await storedConnectors(), "nothing is wired until the drag ends").toHaveLength(0);
  await page.mouse.move(630, 250, { steps: 10 });
  await expect(page.locator(".connector-port")).toHaveCount(8);
  await page.screenshot({ path: testInfo.outputPath("connector-drag-pending.png") });
  await page.mouse.up();
  await expect.poll(async () => (await storedConnectors()).length).toBe(1);
  const [connector] = await storedConnectors();
  expect(connector.from.port, "a drag that left an anchor pins that end").toBe("e");
  await page.mouse.move(400, 520, { steps: 4 });
  await page.screenshot({ path: testInfo.outputPath("connector-committed.png") });

  // Wiring the same pair the same way again would only stack an invisible duplicate.
  await page.mouse.move(360, 250); await page.mouse.down(); await page.mouse.move(630, 250, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await storedConnectors()).toHaveLength(1);

  // The connector stays armed, and a drag that ends on empty board wires nothing.
  await expect(page.getByRole("button", { name: "Connector" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(290, 250); await page.mouse.down(); await page.mouse.move(400, 520, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await storedConnectors()).toHaveLength(1);

  // Connecting is one history entry, and deleting an end takes the edge with it.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await storedConnectors()).length).toBe(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(async () => (await storedConnectors()).length).toBe(1);

  await page.reload();
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await storedConnectors()).length).toBe(1);

  // An edge can be chosen. It is grabbed by the line it draws, so it wears a halo rather than a frame.
  await page.keyboard.press("v");
  await page.mouse.click(460, 250);
  await expect(page.locator(".connector-selection")).toHaveCount(1);
  await expect(page.locator("[data-resize-handle]")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("connector-selected.png") });

  // Empty board below the edge takes nothing: the line is what is grabbable, not the room around it.
  await page.mouse.click(460, 420);
  await expect(page.locator(".connector-selection")).toHaveCount(0);

  // Delete takes the edge and leaves both objects standing; one undo puts it back.
  await page.mouse.click(460, 250);
  await expect(page.locator(".connector-selection")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await storedConnectors()).length).toBe(0);
  expect(await canvas.getAttribute("data-element-count"), "deleting an edge leaves the objects it joined").toBe("2");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await storedConnectors()).length).toBe(1);

  // A selection holds elements or edges, never both, so taking a shape drops the edge.
  await page.mouse.click(460, 250);
  await expect(page.locator(".connector-selection")).toHaveCount(1);
  await page.mouse.click(290, 250);
  await expect(page.locator(".connector-selection")).toHaveCount(0);
  await expect(page.locator("[data-resize-handle]")).toHaveCount(8);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await storedConnectors()).length).toBe(0);
});

/**
 * How much of a connector's own ink (#b85f3f) the canvas put down in a small
 * window, in device pixels. The edge's terracotta is nothing else on the board:
 * an object's outline is near-black and the grid is grey, so a count above zero
 * means the routed edge itself runs through that window.
 */
async function edgeInk(page: Page, x: number, y: number) {
  return page.getByTestId("scene-canvas").evaluate((canvas: HTMLCanvasElement, at) => {
    const context = canvas.getContext("2d");
    if (!context) return 0;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const { data } = context.getImageData(
      Math.round((at.x - 12 - rect.left) * scaleX), Math.round((at.y - 12 - rect.top) * scaleY),
      Math.round(24 * scaleX), Math.round(24 * scaleY),
    );
    let inky = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (Math.abs(data[index] - 184) < 45 && Math.abs(data[index + 1] - 95) < 55 && Math.abs(data[index + 2] - 63) < 55) inky += 1;
    }
    return inky;
  }, { x, y });
}

test("re-routes a connector while the shape it joins is still being dragged", async ({ page }, testInfo) => {
  const canvas = page.getByRole("main", { name: "Draftspace infinite canvas" });
  await page.goto("/");
  await expect(canvas).toBeVisible();

  // Two boxes side by side, so the edge between them is one horizontal run at y = 250.
  for (const left of [200, 560]) {
    await page.keyboard.press("r");
    await page.mouse.move(left, 200); await page.mouse.down(); await page.mouse.move(left + 140, 300, { steps: 5 }); await page.mouse.up();
  }
  await expect.poll(() => canvas.getAttribute("data-element-count")).toBe("2");
  await page.keyboard.press("c");
  await page.mouse.move(270, 250); await page.mouse.down(); await page.mouse.move(630, 250, { steps: 10 }); await page.mouse.up();
  await page.keyboard.press("v");

  // Where the edge runs while both boxes are where they were drawn, and where it does not.
  const alongTheOldRoute = { x: 400, y: 250 };
  const belowTheOldRoute = { x: 450, y: 350 };
  await expect.poll(() => edgeInk(page, alongTheOldRoute.x, alongTheOldRoute.y)).toBeGreaterThan(0);
  expect(await edgeInk(page, belowTheOldRoute.x, belowTheOldRoute.y)).toBe(0);

  // Drag the left box 200px down and hold: the edge has to leave from where the box is being
  // drawn, so it now turns down the middle of the gap instead of running straight across.
  await page.mouse.move(270, 250); await page.mouse.down(); await page.mouse.move(270, 450, { steps: 12 });
  await expect.poll(() => edgeInk(page, belowTheOldRoute.x, belowTheOldRoute.y), { message: "the edge follows the box mid-drag" }).toBeGreaterThan(0);
  expect(await edgeInk(page, alongTheOldRoute.x, alongTheOldRoute.y), "and has left the route it was drawn on").toBe(0);
  await page.screenshot({ path: testInfo.outputPath("connector-follows-drag.png") });

  // Releasing changes nothing about where the edge is: the drag showed what the commit stored.
  await page.mouse.up();
  await expect.poll(() => edgeInk(page, belowTheOldRoute.x, belowTheOldRoute.y)).toBeGreaterThan(0);
  expect(await edgeInk(page, alongTheOldRoute.x, alongTheOldRoute.y)).toBe(0);

  // One undo takes the box back, and the edge goes back with it.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => edgeInk(page, alongTheOldRoute.x, alongTheOldRoute.y)).toBeGreaterThan(0);
  expect(await edgeInk(page, belowTheOldRoute.x, belowTheOldRoute.y)).toBe(0);
});
