import { expect, test } from "@playwright/test";

test.describe("Chromium capability fallbacks", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Capability mutation is covered in Chromium only");

  test("creates, renders, moves, saves, and restores without optional native helpers", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: undefined });
      Object.defineProperty(globalThis, "structuredClone", { configurable: true, value: undefined });
      if (globalThis.crypto) Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
      if (globalThis.CanvasRenderingContext2D) Object.defineProperty(CanvasRenderingContext2D.prototype, "roundRect", { configurable: true, value: undefined });
    });
    await page.goto("/");
    await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
    await page.keyboard.press("r");
    await page.mouse.move(240, 170); await page.mouse.down(); await page.mouse.move(430, 290); await page.mouse.up();
    await page.mouse.move(330, 230); await page.mouse.down(); await page.mouse.move(390, 270); await page.mouse.up();
    await page.waitForTimeout(800); await page.reload();
    await expect(page.getByText("Start with a shape")).toHaveCount(0);
    await page.mouse.click(390, 270);
    await expect(page.locator("[data-resize-handle]")).toHaveCount(8);
  });

  test("uses the in-session clipboard when the Clipboard API is absent", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "clipboard", { configurable: true, get: () => undefined }));
    await page.goto("/"); await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
    await page.keyboard.press("r"); await page.mouse.move(250, 180); await page.mouse.down(); await page.mouse.move(420, 290); await page.mouse.up();
    await page.keyboard.press("ControlOrMeta+c"); await page.keyboard.press("ControlOrMeta+v");
    await page.keyboard.press("Control+z");
    await expect(page.getByText("Start with a shape")).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(page.getByText("Start with a shape")).toBeVisible();
  });

  test("shows an accessible blocking screen when Canvas 2D is unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This browser can’t open the canvas" })).toBeVisible();
    await expect(page.getByText("Your board has not been modified.")).toBeVisible();
    await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveCount(0);
  });

  test("keeps a migrated board usable when its write-back fails", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
    await page.keyboard.press("e");
    await page.mouse.move(250, 180); await page.mouse.down(); await page.mouse.move(420, 290); await page.mouse.up();
    await page.waitForTimeout(800);
    await page.evaluate(async () => new Promise<void>((resolve, reject) => {
      const id = localStorage.getItem("draftspace:last-board"); const request = indexedDB.open("draftspace");
      request.onerror = () => reject(request.error); request.onsuccess = () => {
        const database = request.result; const transaction = database.transaction("boards", "readwrite"); const store = transaction.objectStore("boards"); const get = store.get(id!);
        get.onsuccess = () => store.put({ ...get.result, schemaVersion: 1, elements: Object.fromEntries(get.result.elementIds.map((elementId: string) => {
          const element = get.result.elements[elementId];
          return [elementId, { ...element, type: "rectangle", cornerRadius: 10 }];
        })) });
        transaction.oncomplete = () => { database.close(); resolve(); }; transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    }));
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
        if (value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion === 3) throw new DOMException("Migration write blocked", "QuotaExceededError");
        return key === undefined ? put.call(this, value) : put.call(this, value, key);
      };
    });
    await page.reload();
    await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Not saving" })).toBeVisible();
    await page.getByRole("button", { name: "Not saving" }).click();
    await expect(page.getByText("Browser storage is full.")).toBeVisible();
    await expect(page.getByText("Start with a shape")).toHaveCount(0);
  });
});
