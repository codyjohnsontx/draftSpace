import { expect, test, type Page } from "@playwright/test";

// Firefox on Linux CI mis-hit-tests DOM overlaid on the accelerated canvas layer and reports the
// canvas as intercepting clicks that land fine for real users, so it activates buttons directly.
async function pressButton(page: Page, browserName: string, name: string) {
  const button = page.getByRole("button", { name });
  if (browserName === "firefox") {
    await expect(button).toBeVisible();
    await button.dispatchEvent("click");
    return;
  }
  await button.click();
}

/**
 * Reveals a colour the floating bar has no room to show. Six of the ten are on the bar; the rest,
 * the recent colours and the eyedropper sit behind the palette button beside them, so a test that
 * wants one of those has to open it exactly as a person would.
 */
async function openPalette(page: Page, browserName: string, control: "fill" | "stroke") {
  await pressButton(page, browserName, `More ${control} colors`);
}

/**
 * Every control the floating bar is drawing that has left the bar, or the window - named and
 * measured, so a failure says which one went and where. The bar wraps rather than scrolls, so a
 * control it cannot fit costs it a row; a control that instead spills past its edge is either
 * clipped away by `overflow: hidden` on the document or painted over the header beside it, and
 * both are silent.
 */
async function escapingControls(bar: ReturnType<Page["locator"]>) {
  return bar.locator(".inspector-controls").evaluate((controls) => {
    const sheet = controls.closest(".style-inspector")!.getBoundingClientRect();
    const describe = (control: Element) => control.getAttribute("aria-label") ?? control.tagName.toLowerCase();
    return [...controls.querySelectorAll(".inspector-group, button, input")]
      // A popover is meant to leave the bar - that is the point of opening above it.
      .filter((control) => !control.closest(".color-popover"))
      .map((control) => ({ name: describe(control), box: control.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .filter(({ box }) => box.left < sheet.left - 1 || box.right > sheet.right + 1 || box.left < 0 || box.right > window.innerWidth)
      .map(({ name, box }) => `${name} at ${Math.round(box.left)}..${Math.round(box.right)} of bar ${Math.round(sheet.left)}..${Math.round(sheet.right)} in ${window.innerWidth}px`);
  });
}

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

type StoredBoard = { elements: Record<string, Record<string, unknown>>; connectorIds: string[]; connectors: Record<string, Record<string, unknown>> };

/** The last-opened board exactly as IndexedDB holds it; both projections below read through this. */
async function readStoredBoard(page: Page): Promise<StoredBoard> {
  return page.evaluate(async () => new Promise<StoredBoard>((resolve, reject) => {
    const id = localStorage.getItem("draftspace:last-board");
    // Without an id there is nothing to ask IndexedDB for, and get(null) would throw where no
    // reject can see it, leaving this promise hanging until the test times out with nothing to read.
    if (!id) { reject(new Error("no board is open: draftspace:last-board is not set")); return; }
    const request = indexedDB.open("draftspace");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const get = database.transaction("boards").objectStore("boards").get(id);
      get.onsuccess = () => {
        database.close();
        if (!get.result) { reject(new Error(`no stored board for id ${id}`)); return; }
        resolve(get.result);
      };
      get.onerror = () => { database.close(); reject(get.error); };
    };
  }));
}

async function readStoredElements(page: Page) {
  return (await readStoredBoard(page)).elements;
}

test("styles a selected shape with one-entry continuous edits", async ({ browserName, page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.keyboard.press("r");
  await page.mouse.move(250, 180); await page.mouse.down(); await page.mouse.move(450, 300); await page.mouse.up();

  const inspector = page.getByRole("toolbar", { name: "Style inspector" });
  await expect(inspector).toBeVisible();
  await openPalette(page, browserName, "fill");
  await pressButton(page, browserName, "Set fill to Blue");
  await openPalette(page, browserName, "stroke");
  await pressButton(page, browserName, "Set stroke to Plum");
  await pressButton(page, browserName, "Set stroke width to 4");
  await pressButton(page, browserName, "Set stroke style to dotted");
  await setRange(page, "Opacity", 45);
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveAttribute("aria-valuetext", "45%");

  await pressButton(page, browserName, "Undo");
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveAttribute("aria-valuetext", "100%");
  await pressButton(page, browserName, "Redo");
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveAttribute("aria-valuetext", "45%");
  await setRange(page, "Corner radius", 36);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(800, 400);
  await page.screenshot({ path: testInfo.outputPath("style-inspector-floating.png") });

  await expect.poll(async () => Object.values(await readStoredElements(page))[0]).toMatchObject({ fillColor: "#4f6fa8", strokeColor: "#7b5f86", strokeWidth: 4, strokeStyle: "dotted", opacity: .45, cornerRadius: 36 });
  await page.reload();
  // The board rehydrates from IndexedDB after mount, so the click needs the shape to exist first.
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-element-count", "1");
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
  await expect(sidebar.getByText("Select a shape or a connector to edit its style.")).toBeVisible();
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

test("fits every floating control inside the bar at a laptop width", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "One engine is enough for a width budget.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();

  // A rectangle is the widest single shape: it is the only one that adds a Corners group.
  await page.keyboard.press("r");
  await page.mouse.move(250, 180); await page.mouse.down(); await page.mouse.move(450, 300); await page.mouse.up();
  const bar = page.getByRole("toolbar", { name: "Style inspector" });
  await expect(bar).toBeVisible();

  // Going over budget used to hide the controls at the right-hand end with no scrollbar, fade or
  // chevron to say so - 159px of them at this size - so the only way to catch it is to measure.
  // Measuring the bar's own box says nothing: `width: max-content` under a `max-width` keeps it
  // on screen however far its contents run past it. What has to hold is that no control escapes
  // the bar it is drawn on, or the window.
  expect(await escapingControls(bar)).toEqual([]);

  // Six of the ten colours are on the bar and the other four are behind the palette button, so
  // the whole palette is still reachable - this is a disclosure, not a smaller set of colours.
  await expect(bar.locator(".color-group").first().locator(".color-swatch")).toHaveCount(7); // "none" + six
  await page.getByRole("button", { name: "More fill colors" }).click();
  const disclosed = page.getByRole("group", { name: "More fill colors" });
  await expect(disclosed.getByRole("button")).toHaveCount(4);
  for (const name of ["Sage", "Teal", "Blue", "Plum"]) {
    await expect(disclosed.getByRole("button", { name: `Set fill to ${name}` })).toBeVisible();
  }
});

test("keeps every floating control on screen from a laptop down to a phone", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "One engine is enough for a width budget.");
  const AUTHORING = { width: 1280, height: 800 };
  await page.setViewportSize(AUTHORING);
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();

  await page.keyboard.press("r");
  await page.mouse.move(150, 180); await page.mouse.down(); await page.mouse.move(280, 260, { steps: 5 }); await page.mouse.up();
  await page.keyboard.press("r");
  await page.mouse.move(480, 180); await page.mouse.down(); await page.mouse.move(610, 260, { steps: 5 }); await page.mouse.up();
  await page.keyboard.press("r");
  await page.mouse.move(150, 380); await page.mouse.down(); await page.mouse.move(280, 460, { steps: 5 }); await page.mouse.up();
  await page.keyboard.press("e");
  await page.mouse.move(480, 380); await page.mouse.down(); await page.mouse.move(610, 460, { steps: 5 }); await page.mouse.up();
  await page.keyboard.press("c");
  await page.mouse.move(280, 220); await page.mouse.down(); await page.mouse.move(480, 220, { steps: 10 }); await page.mouse.up();
  await page.keyboard.press("c");
  await page.mouse.move(280, 420); await page.mouse.down(); await page.mouse.move(480, 420, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => (await readStoredConnectors(page)).length).toBe(2);
  await page.keyboard.press("v");

  const bar = page.getByRole("toolbar", { name: "Style inspector" });
  // The header sizes itself from this label, and the label is what picks the control set, so the
  // widest bar is not the widest shape - it is whichever of these draws the widest group. Every
  // branch of `selectionLabel` gets measured rather than the one a shape happens to take.
  const selections: { label: string; select: () => Promise<void> }[] = [
    { label: "Rectangle", select: async () => { await page.mouse.click(215, 220); } },
    { label: "Ellipse", select: async () => { await page.mouse.click(545, 420); } },
    { label: "2 mixed shapes", select: async () => {
      await page.mouse.click(215, 220);
      await page.keyboard.down("Shift"); await page.mouse.click(545, 420); await page.keyboard.up("Shift");
    } },
    { label: "Connector", select: async () => { await page.mouse.click(380, 220); } },
    { label: "2 connectors", select: async () => {
      await page.mouse.click(380, 220);
      await page.keyboard.down("Shift"); await page.mouse.click(380, 420); await page.keyboard.up("Shift");
    } },
  ];

  for (const { label, select } of selections) {
    await page.setViewportSize(AUTHORING);
    await page.keyboard.press("Escape");
    await select();
    await expect(bar).toBeVisible();
    await expect(bar.getByText(label, { exact: true })).toBeVisible();

    for (const width of [1440, 1366, 1280, 1024, 375, 360]) {
      await page.setViewportSize({ width, height: 720 });
      await expect.poll(async () => (await bar.boundingBox())!.width).toBeLessThanOrEqual(width);
      expect(await escapingControls(bar), `${label} at ${width}px`).toEqual([]);
    }
  }

  // The palette button is what makes the four colours behind it reachable at all, so a phone
  // losing it off the right-hand edge loses everything behind it, not just the button.
  await page.setViewportSize(AUTHORING);
  await page.keyboard.press("Escape");
  await page.mouse.click(215, 220);
  await page.setViewportSize({ width: 375, height: 720 });
  const trigger = page.getByRole("button", { name: "More fill colors" });
  const triggerBox = (await trigger.boundingBox())!;
  expect(triggerBox.x).toBeGreaterThanOrEqual(0);
  expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(375);
  await trigger.click();
  await expect(page.getByRole("group", { name: "More fill colors" }).getByRole("button", { name: "Set fill to Plum" })).toBeVisible();

  // The disclosure is the one thing on the bar allowed to leave it, so it is measured against the
  // window instead. `toBeVisible()` cannot stand in for this: a popover the viewport has clipped
  // away is still visible to the DOM. These widths are where the colour row wraps such that the
  // trigger starts a row - 430px for Fill, 400px for Stroke - which is when a popover hung to the
  // left of its own trigger runs off the near edge.
  for (const { width, control, colour } of [
    { width: 430, control: "fill", colour: "Set fill to Plum" },
    { width: 400, control: "stroke", colour: "Set stroke to Plum" },
  ]) {
    await page.setViewportSize({ width, height: 780 });
    const disclose = page.getByRole("button", { name: `More ${control} colors` });
    await expect(disclose).toBeVisible();
    if (await page.getByRole("group", { name: `More ${control} colors` }).count() === 0) await disclose.click();
    const popover = (await page.getByRole("group", { name: `More ${control} colors` }).boundingBox())!;
    expect(Math.round(popover.x), `${control} popover left at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(Math.round(popover.x + popover.width), `${control} popover right at ${width}px`).toBeLessThanOrEqual(width);
    await disclose.click();
  }
});

test("handles mixed selections, rectangle-only corners, and recent custom colors", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "Detailed mixed-selection coverage runs in Chromium.");
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.keyboard.press("r");
  await page.mouse.move(180, 180); await page.mouse.down(); await page.mouse.move(340, 280); await page.mouse.up();
  await page.keyboard.press("e");
  await page.mouse.move(430, 180); await page.mouse.down(); await page.mouse.move(590, 280); await page.mouse.up();

  await openPalette(page, browserName, "fill");
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

async function readStoredConnectors(page: Page) {
  const board = await readStoredBoard(page);
  return board.connectorIds.map((connectorId) => board.connectors[connectorId]);
}

test("styles and names a selected connector", async ({ browserName, page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();

  for (const left of [220, 560]) {
    await page.keyboard.press("r");
    await page.mouse.move(left, 200); await page.mouse.down(); await page.mouse.move(left + 140, 300, { steps: 5 }); await page.mouse.up();
  }
  await page.keyboard.press("c");
  await page.mouse.move(360, 250); await page.mouse.down(); await page.mouse.move(630, 250, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => (await readStoredConnectors(page)).length).toBe(1);

  // Taking the edge scopes the inspector to what an edge has: no fill, no text block, no box.
  await page.keyboard.press("v");
  await page.mouse.click(460, 250);
  await expect(page.locator(".connector-selection")).toHaveCount(1);
  const inspector = page.getByRole("toolbar", { name: "Style inspector" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText("Connector", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set fill to Blue" })).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveCount(0);

  await openPalette(page, browserName, "stroke");
  await pressButton(page, browserName, "Set stroke to Teal");
  await pressButton(page, browserName, "Set connector width to 4");
  await pressButton(page, browserName, "Set connector kind to async");
  await expect.poll(async () => (await readStoredConnectors(page))[0]).toMatchObject({ strokeColor: "#3f7f78", strokeWidth: 4, kind: "async" });

  // An edge has no box to put a caret in, so it is named where the rest of its style is set.
  const label = page.getByRole("textbox", { name: "Connector label" });
  await label.fill("publishes");
  await label.press("Enter");
  await expect.poll(async () => (await readStoredConnectors(page))[0].label).toBe("publishes");
  await page.mouse.move(800, 480);
  await page.screenshot({ path: testInfo.outputPath("connector-style.png") });

  // Naming is its own entry, so one undo takes the name back and leaves the styling standing.
  await pressButton(page, browserName, "Undo");
  await expect.poll(async () => (await readStoredConnectors(page))[0]).toMatchObject({ label: null, kind: "async", strokeWidth: 4 });

  await page.reload();
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.mouse.click(460, 250);
  await expect(page.getByRole("button", { name: "Set connector kind to async" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Set connector width to 4" })).toHaveAttribute("aria-pressed", "true");
});

test("gives a docked edge's name the whole column", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "Detailed responsive layout coverage runs in Chromium.");
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  for (const left of [220, 560]) {
    await page.keyboard.press("r");
    await page.mouse.move(left, 200); await page.mouse.down(); await page.mouse.move(left + 140, 300, { steps: 5 }); await page.mouse.up();
  }
  await page.keyboard.press("c");
  await page.mouse.move(360, 250); await page.mouse.down(); await page.mouse.move(630, 250, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => (await readStoredConnectors(page)).length).toBe(1);
  await page.keyboard.press("v");
  await page.mouse.click(460, 250);

  await page.getByRole("button", { name: "Inspector layout" }).click();
  await page.getByRole("menuitemradio", { name: /Right sidebar/ }).click();
  const docked = page.getByRole("complementary", { name: "Style inspector" });
  await expect(docked).toBeVisible();

  // The width the floating bar holds this field to is a concession to a bar 359px wide on a phone,
  // and it must not follow the field into a panel that has room. Measured against the colour row
  // beside it rather than a number, so a scrollbar or a padding change moves both together.
  const column = (await docked.locator(".color-row").first().boundingBox())!;
  const named = (await docked.getByRole("textbox", { name: "Connector label" }).boundingBox())!;
  expect(Math.round(named.width)).toBe(Math.round(column.width));
});

/**
 * How much of the edge's own ink the canvas put down in a small window at one end
 * of the route, in device pixels. A head is drawn as a triangle back from the
 * anchor, so the window fills in when that end carries one and holds only the
 * line's own width when it does not - which is what proves the head was drawn
 * rather than only stored.
 */
async function inkNear(page: Page, x: number, y: number, towards: -1 | 1) {
  return page.locator("canvas").evaluate((canvas: HTMLCanvasElement, at) => {
    const context = canvas.getContext("2d");
    if (!context) return 0;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    // The window runs back along the route from the anchor, which is whichever way the edge leaves that end.
    const left = Math.round((at.x + (at.towards < 0 ? -12 : 0) - rect.left) * scaleX);
    const top = Math.round((at.y - 20 - rect.top) * scaleY);
    const { data } = context.getImageData(left, top, Math.round(12 * scaleX), Math.round(40 * scaleY));
    let inky = 0;
    // The edge's default ink (#b85f3f), matched loosely enough to survive antialiasing but not to
    // catch the paper it is drawn on or the grid dots printed under it.
    for (let index = 0; index < data.length; index += 4) {
      if (Math.abs(data[index] - 184) < 45 && Math.abs(data[index + 1] - 95) < 55 && Math.abs(data[index + 2] - 63) < 55) inky += 1;
    }
    return inky;
  }, { x, y, towards });
}

test("points an edge at one end, the other, or both", async ({ browserName, page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();

  // Two boxes side by side, so the edge between them is one horizontal run and each end is a clean window.
  for (const left of [200, 560]) {
    await page.keyboard.press("r");
    await page.mouse.move(left, 200); await page.mouse.down(); await page.mouse.move(left + 140, 300, { steps: 5 }); await page.mouse.up();
  }
  await page.keyboard.press("c");
  await page.mouse.move(270, 250); await page.mouse.down(); await page.mouse.move(630, 250, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => (await readStoredConnectors(page)).length).toBe(1);
  const source = { x: 340, y: 250 };
  const target = { x: 560, y: 250 };

  await page.keyboard.press("v");
  await page.mouse.click(450, 250);
  await expect(page.locator(".connector-selection")).toHaveCount(1);
  // An edge points at what it was dragged to until it is told otherwise.
  await expect(page.getByRole("button", { name: "Set connector arrows to a head at the target" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(900, 480);
  const pointing = { atTarget: await inkNear(page, target.x, target.y, -1), atSource: await inkNear(page, source.x, source.y, 1) };

  await pressButton(page, browserName, "Set connector arrows to no heads");
  await expect.poll(async () => (await readStoredConnectors(page))[0].arrows).toBe("none");
  await page.mouse.move(900, 480);
  const bare = { atTarget: await inkNear(page, target.x, target.y, -1), atSource: await inkNear(page, source.x, source.y, 1) };
  // Taking the head away leaves only the line's own width at that end, and never touches the other one.
  expect(pointing.atTarget).toBeGreaterThan(bare.atTarget * 1.4);
  expect(pointing.atSource).toBeLessThan(bare.atSource * 1.4);

  await pressButton(page, browserName, "Set connector arrows to a head at the source");
  await expect.poll(async () => (await readStoredConnectors(page))[0].arrows).toBe("start");
  await page.mouse.move(900, 480);
  const backwards = { atTarget: await inkNear(page, target.x, target.y, -1), atSource: await inkNear(page, source.x, source.y, 1) };
  // A head belongs to an end of the binding, so the source end is where it goes however the boxes are placed.
  expect(backwards.atSource).toBeGreaterThan(bare.atSource * 1.4);
  expect(backwards.atTarget).toBeLessThan(bare.atTarget * 1.4);

  await pressButton(page, browserName, "Set connector arrows to heads at both ends");
  await expect.poll(async () => (await readStoredConnectors(page))[0].arrows).toBe("both");
  await page.mouse.move(900, 480);
  const both = { atTarget: await inkNear(page, target.x, target.y, -1), atSource: await inkNear(page, source.x, source.y, 1) };
  expect(both.atTarget).toBeGreaterThan(bare.atTarget * 1.4);
  expect(both.atSource).toBeGreaterThan(bare.atSource * 1.4);
  await page.screenshot({ path: testInfo.outputPath("connector-arrows.png") });

  // Choosing which ends carry a head is one history entry, like every other edge style.
  await pressButton(page, browserName, "Undo");
  await expect.poll(async () => (await readStoredConnectors(page))[0].arrows).toBe("start");
  await pressButton(page, browserName, "Redo");
  await expect.poll(async () => (await readStoredConnectors(page))[0].arrows).toBe("both");

  await page.reload();
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.mouse.click(450, 250);
  await expect(page.getByRole("button", { name: "Set connector arrows to heads at both ends" })).toHaveAttribute("aria-pressed", "true");
});
