import { expect, test } from "@playwright/test";

test("creates, moves, undoes, and restores a rectangle", async ({ page }) => {
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
  await page.screenshot({ path: "test-results/draftspace-phase1.png" });
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
  const savedZoom = await zoom.textContent();
  await page.waitForTimeout(1100); await page.reload();
  await expect(page.getByRole("button", { name: "Reset zoom to 100%" })).toHaveText(savedZoom ?? "");
});

test("preserves a corrupt board and offers recovery", async ({ page }) => {
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
  await page.screenshot({ path: "test-results/draftspace-recovery.png" });
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Download raw data" }).click();
  expect((await downloadPromise).suggestedFilename()).toContain("draftspace-recovery");
  await page.getByRole("button", { name: "Start a new board" }).click();
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  const originalStillExists = await page.evaluate(async (id) => new Promise<boolean>((resolve, reject) => {
    const request = indexedDB.open("draftspace", 1); request.onerror = () => reject(request.error); request.onsuccess = () => {
      const db = request.result; const get = db.transaction("boards").objectStore("boards").get(id!); get.onsuccess = () => { db.close(); resolve(Boolean(get.result?.damaged)); }; get.onerror = () => reject(get.error);
    };
  }), damagedId);
  expect(originalStillExists).toBe(true);
});

test("keeps the canvas usable without IndexedDB", async ({ page }) => {
  await page.addInitScript(() => {
    const availableStorage = globalThis.indexedDB; let enabled = false;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, get: () => enabled ? availableStorage : undefined });
    Object.defineProperty(globalThis, "__enableDraftspaceStorage", { configurable: true, value: () => { enabled = true; } });
  });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.getByRole("button", { name: "Not saving" }).click();
  await expect(page.getByRole("dialog", { name: "Local storage unavailable" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/draftspace-session-only.png" });
  await expect(page.getByRole("button", { name: "Retry storage" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download backup" })).toBeVisible();
  await page.evaluate(() => (globalThis as typeof globalThis & { __enableDraftspaceStorage: () => void }).__enableDraftspaceStorage());
  await page.getByRole("button", { name: "Retry storage" }).click();
  await expect(page.getByText("Saved locally")).toBeVisible();
});
