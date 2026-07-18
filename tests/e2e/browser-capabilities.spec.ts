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
    await expect(page.getByText("Start with a rectangle")).toHaveCount(0);
    await page.mouse.click(390, 270);
    await expect(page.locator("[data-resize-handle]")).toHaveCount(8);
  });

  test("uses the in-session clipboard when the Clipboard API is absent", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "clipboard", { configurable: true, get: () => undefined }));
    await page.goto("/"); await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
    await page.keyboard.press("r"); await page.mouse.move(250, 180); await page.mouse.down(); await page.mouse.move(420, 290); await page.mouse.up();
    await page.keyboard.press("Control+c"); await page.keyboard.press("Control+v");
    await page.keyboard.press("Control+z");
    await expect(page.getByText("Start with a rectangle")).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(page.getByText("Start with a rectangle")).toBeVisible();
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
});
