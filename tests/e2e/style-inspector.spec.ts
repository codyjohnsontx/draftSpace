import { expect, test, type Page } from "@playwright/test";

// The inspector's settle-in animations make swatches "not stable" under slow CI rendering;
// reduced motion disables them via the app's global reduce-motion CSS without changing behavior.
test.use({ reducedMotion: "reduce" });

async function setRange(page: Page, name: string, value: number) {
  const slider = page.getByRole("slider", { name });
  await slider.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await expect(slider).toHaveAttribute("aria-valuetext", new RegExp(`^${value}`));
  await slider.dispatchEvent("pointerup");
}

async function readStoredElements(page: Page) {
  return page.evaluate(async () => new Promise<Record<string, Record<string, unknown>>>((resolve, reject) => {
    const id = localStorage.getItem("draftspace:last-board");
    const request = indexedDB.open("draftspace");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const get = database.transaction("boards").objectStore("boards").get(id!);
      get.onsuccess = () => { database.close(); resolve(get.result.elements); };
      get.onerror = () => { database.close(); reject(get.error); };
    };
  }));
}

test("styles a selected shape with one-entry continuous edits", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.keyboard.press("r");
  await page.mouse.move(250, 180); await page.mouse.down(); await page.mouse.move(450, 300); await page.mouse.up();

  const inspector = page.getByRole("toolbar", { name: "Style inspector" });
  await expect(inspector).toBeVisible();
  await page.getByRole("button", { name: "Set fill to Blue" }).click();
  await page.getByRole("button", { name: "Set stroke to Plum" }).click();
  await page.getByRole("button", { name: "Set stroke width to 4" }).click();
  await page.getByRole("button", { name: "Set stroke style to dotted" }).click();
  await setRange(page, "Opacity", 45);
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveAttribute("aria-valuetext", "45%");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveAttribute("aria-valuetext", "100%");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveAttribute("aria-valuetext", "45%");
  await setRange(page, "Corner radius", 36);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(800, 400);
  await page.screenshot({ path: testInfo.outputPath("style-inspector-floating.png") });

  await expect.poll(async () => Object.values(await readStoredElements(page))[0]).toMatchObject({ fillColor: "#4f6fa8", strokeColor: "#7b5f86", strokeWidth: 4, strokeStyle: "dotted", opacity: .45, cornerRadius: 36 });
  await page.reload();
  await page.mouse.click(350, 240);
  await expect(page.getByRole("button", { name: "Set fill to Blue" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveAttribute("aria-valuetext", "45%");
});

test("switches and persists inspector layouts", async ({ browserName, page }, testInfo) => {
  test.skip(browserName !== "chromium", "Detailed responsive layout coverage runs in Chromium.");
  await page.goto("/");
  const canvas = page.getByRole("main", { name: "Draftspace infinite canvas" });
  await expect(canvas).toBeVisible();
  const fullWidth = (await canvas.boundingBox())!.width;

  await page.getByRole("button", { name: "Inspector layout" }).click();
  await page.getByRole("menuitemradio", { name: /Right sidebar/ }).click();
  const sidebar = page.getByRole("complementary", { name: "Style inspector" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("Select a shape to edit its style.")).toBeVisible();
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeLessThan(fullWidth - 250);
  await page.screenshot({ path: testInfo.outputPath("style-inspector-sidebar.png") });

  await sidebar.getByRole("button", { name: "Floating inspector" }).click();
  await expect(sidebar).toHaveCount(0);
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(fullWidth);
  await page.getByRole("button", { name: "Inspector layout" }).click();
  await page.getByRole("menuitemradio", { name: /Right sidebar/ }).click();
  await expect(page.getByRole("complementary", { name: "Style inspector" })).toBeVisible();

  const reopenedSidebar = page.getByRole("complementary", { name: "Style inspector" });
  await reopenedSidebar.getByRole("button", { name: "Hidden inspector" }).click();
  await expect(reopenedSidebar).toHaveCount(0);
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(fullWidth);
  await page.getByRole("button", { name: "Inspector layout" }).click();
  await expect(page.getByRole("menuitemradio", { name: /Hidden/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitem", { name: /Show inspector/ }).click();
  await expect(page.getByRole("complementary", { name: "Style inspector" })).toBeVisible();

  await page.getByRole("button", { name: "Inspector layout" }).click();
  await page.getByRole("menuitemradio", { name: /Floating/ }).click();
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(fullWidth);
  await page.getByRole("button", { name: "Inspector layout" }).click();
  await page.getByRole("menuitemradio", { name: /Hidden/ }).click();
  await page.getByRole("button", { name: "Inspector layout" }).click();
  await page.getByRole("menuitemradio", { name: /Right sidebar/ }).click();
  await expect(page.getByRole("complementary", { name: "Style inspector" })).toBeVisible();

  await page.setViewportSize({ width: 820, height: 700 });
  await expect(page.locator(".save-status > span")).toBeHidden();
  const topBarBox = (await page.getByRole("banner", { name: "Board controls" }).boundingBox())!;
  const topActionsBox = (await page.locator(".top-actions").boundingBox())!;
  expect(topActionsBox.x + topActionsBox.width).toBeLessThanOrEqual(topBarBox.x + topBarBox.width);
  const viewportControlsBox = (await page.locator(".viewport-controls").boundingBox())!;
  const toolRailBox = (await page.getByRole("navigation", { name: "Drawing tools" }).boundingBox())!;
  expect(viewportControlsBox.y + viewportControlsBox.height).toBeLessThan(toolRailBox.y);
  await page.screenshot({ path: testInfo.outputPath("style-inspector-compact-dock.png") });

  await page.setViewportSize({ width: 600, height: 700 });
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(600);
  await page.screenshot({ path: testInfo.outputPath("style-inspector-overlay.png") });
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Style inspector" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftspace:inspector-preferences")!).mode)).toBe("sidebar");
});

test("handles mixed selections, rectangle-only corners, and recent custom colors", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "Detailed mixed-selection coverage runs in Chromium.");
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.keyboard.press("r");
  await page.mouse.move(180, 180); await page.mouse.down(); await page.mouse.move(340, 280); await page.mouse.up();
  await page.keyboard.press("e");
  await page.mouse.move(430, 180); await page.mouse.down(); await page.mouse.move(590, 280); await page.mouse.up();

  const customFill = page.getByLabel("Custom fill color");
  await customFill.focus();
  await customFill.evaluate((element) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "#123456");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await customFill.blur();
  await page.keyboard.down("Shift"); await page.mouse.click(250, 230); await page.keyboard.up("Shift");
  await expect(page.getByText("2 mixed shapes")).toBeVisible();
  await expect(page.getByText("Mixed").first()).toBeVisible();
  await page.getByRole("button", { name: "Set stroke width to 8" }).click();
  await setRange(page, "Corner radius", 42);
  await expect(page.getByText("Rectangles only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Set fill to recent color #123456" })).toBeVisible();

  await expect.poll(async () => {
    const elements = Object.values(await readStoredElements(page));
    return {
      strokeWidths: elements.map((element) => element.strokeWidth),
      rectangleCornerRadius: elements.find((element) => element.type === "rectangle")?.cornerRadius,
      ellipseHasCornerRadius: Object.hasOwn(elements.find((element) => element.type === "ellipse") ?? {}, "cornerRadius"),
    };
  }).toEqual({ strokeWidths: [8, 8], rectangleCornerRadius: 42, ellipseHasCornerRadius: false });
  expect(await page.evaluate(() => {
    const preference = JSON.parse(localStorage.getItem("draftspace:inspector-preferences")!);
    return { recentColors: preference.recentColors, boardPreferenceLeak: Object.values(preference).some((value) => value === "draftspace/board") };
  })).toEqual({ recentColors: ["#123456"], boardPreferenceLeak: false });
});
