import { expect, test } from "@playwright/test";

test("explains every toolbar control consistently", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  const controls = [
    ["Select", "Select, move, and resize objects"],
    ["Hand", "Pan around the canvas"],
    ["Rectangle", "Draw a rectangle"],
    ["Tool lock", "Keep a drawing tool active"],
    ["Zoom out", "See more of the board"],
    ["Reset zoom to 100%", "Return to 100% zoom"],
    ["Zoom in", "Get a closer view"],
    ["Zoom to fit", "Fit every object"],
    ["Change background pattern", "Cycle dots, grid, and plain"],
    ["Snap to grid", "Click to align objects"],
    ["Undo", "Reverse the last board change"],
    ["Redo", "Restore the last undone change"],
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
  await expect(page.getByText("Start with a rectangle")).toBeVisible();
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
  await expect(page.getByText("Start with a rectangle")).toHaveCount(0);
});

test("cancels drawing without changing history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.keyboard.press("r");
  await page.mouse.move(280, 220); await page.mouse.down(); await page.mouse.move(480, 340);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(page.getByText("Start with a rectangle")).toBeVisible();
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
