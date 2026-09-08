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

  // The disclosure is the one thing on the bar allowed to leave the bar, so it is measured against
  // the window on BOTH axes and against its own trigger. `toBeVisible()` cannot stand in for any of
  // it: a popover the viewport has clipped away, or one opened at the far end of the bar from the
  // button that opened it, is still visible to the DOM. The widths are where the colour row wraps
  // so the trigger starts a row, which is when a popover hung to its left reaches the near edge;
  // the tall-and-narrow pairs are where a popover placed against the bar rather than the trigger
  // ends up above the top of the window.
  for (const { width, height, control } of [
    { width: 389, height: 780, control: "stroke" },
    { width: 400, height: 780, control: "stroke" },
    { width: 430, height: 780, control: "fill" },
    { width: 452, height: 780, control: "fill" },
    { width: 375, height: 720, control: "fill" },
    { width: 375, height: 667, control: "fill" },
    { width: 375, height: 667, control: "stroke" },
  ]) {
    await page.setViewportSize({ width, height });
    const where = `${control} popover at ${width}x${height}`;
    const disclose = page.getByRole("button", { name: `More ${control} colors` });
    await expect(disclose).toBeVisible();
    const opened = page.getByRole("group", { name: `More ${control} colors` });
    if (await opened.count() === 0) await disclose.click();
    const trigger = (await disclose.boundingBox())!;
    const popover = (await opened.boundingBox())!;
    expect(Math.round(popover.x), `${where}: left edge`).toBeGreaterThanOrEqual(0);
    expect(Math.round(popover.x + popover.width), `${where}: right edge`).toBeLessThanOrEqual(width);
    expect(Math.round(popover.y), `${where}: top edge`).toBeGreaterThanOrEqual(0);
    expect(Math.round(popover.y + popover.height), `${where}: bottom edge`).toBeLessThanOrEqual(height);
    // Attached to the button that opened it, not to the bar: the two share a right edge.
    expect(Math.round(popover.x + popover.width), `${where}: attached to its trigger`)
      .toBeCloseTo(Math.round(trigger.x + trigger.width), -1);
    await disclose.click();
  }
});

/** Picks a colour the palette does not carry, through the disclosure's own input. */
async function pickCustomColor(page: Page, label: string, hex: string) {
  const input = page.getByLabel(label);
  await input.focus();
  await input.evaluate((element, value) => {
    const picker = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(picker, value);
    picker.dispatchEvent(new Event("input", { bubbles: true }));
  }, hex);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await input.blur();
}

/** The six a phone can reach only through the disclosure's own input, in the order it takes them. */
const CUSTOM_COLORS = ["#123456", "#654321", "#abcdef", "#0f0f0f", "#112233", "#445566"];

/** The edges the disclosure is claiming to have chips behind, in the order it drew them. */
const affordanceEdges = (popover: ReturnType<Page["locator"]>) =>
  popover.evaluate((panel) => [...panel.querySelectorAll(".color-popover-more")].map((edge) => edge.getAttribute("data-edge")));

/** Puts the grid back where it opens, so what it is hiding is read from the top of its scroll. */
const rewind = (popover: ReturnType<Page["locator"]>) =>
  popover.evaluate((panel) => { (panel.querySelector(".color-row") as HTMLElement).scrollTop = 0; });

/**
 * What the disclosure is showing, measured rather than counted: its own box, the scroll port
 * against the grid held inside it, and whether a press at each chip's centre would land on that
 * chip once the grid has brought it into view. The top bar is what makes that last question
 * different from mere presence - a row grown up behind it is in the DOM and answers
 * `elementFromPoint` with the bar - and so is the popover's own surface, which a row the grid
 * spills rather than scrolls is painted outside of.
 */
async function readDisclosure(popover: ReturnType<Page["locator"]>) {
  return popover.evaluate((panel) => {
    const grid = panel.querySelector(".color-row") as HTMLElement;
    const surface = panel.getBoundingClientRect();
    const reachable = (chip: Element) => {
      chip.scrollIntoView({ block: "nearest", inline: "nearest" });
      const box = chip.getBoundingClientRect();
      const pressed = document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2));
      return box.top >= surface.top - 1 && box.bottom <= surface.bottom + 1 && !!pressed && chip.contains(pressed);
    };
    const name = (chip: Element) => chip.getAttribute("aria-label") ?? chip.querySelector("input")?.getAttribute("aria-label") ?? chip.tagName;
    const chips = [...grid.children];
    return {
      box: { left: Math.round(surface.left), right: Math.round(surface.right), top: Math.round(surface.top), bottom: Math.round(surface.bottom) },
      chips: chips.length,
      port: grid.clientHeight,
      content: grid.scrollHeight,
      unreachable: chips.filter((chip) => !reachable(chip)).map(name),
      eyedropper: reachable(grid.querySelector(".custom-color")!),
    };
  });
}

// Five 28px chips, the 8px gutter between two of them and the port's own 4px above and below:
// 36px buys a row, and every height below is stated in rows because that is what a user counts.
const ROW = 36;

// Two phones, because measuring the room rather than naming a row count is the fix, and the two get
// different answers. On 375x667 - the shortest viewport whose bar still clears the top bar - the
// palette button leaves 53px above it, against the 58px the panel's heading, padding and its gap
// from the trigger want before a single chip, so one row is genuinely all that fits and the grid
// scrolls inside it. On 390x844, a current phone, the whole grid stands above the trigger with
// nothing to scroll at all. No constant says both, which is why the disclosure measures. They run a
// context apart because recent colours outlive a reload, and six of them is where each one ends.
for (const { width, height, rows } of [
  { width: 375, height: 667, rows: { 0: 1, 1: 1, 6: 1 } },
  { width: 390, height: 844, rows: { 0: 1, 1: 2, 6: 3 } },
] as const) {
  test(`fits the ${width}x${height} palette disclosure to the room genuinely above its trigger`, async ({ browserName, page }) => {
    test.skip(browserName !== "chromium", "One engine is enough for a height budget.");
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
    await page.keyboard.press("r");
    await page.mouse.move(120, 150); await page.mouse.down(); await page.mouse.move(240, 240, { steps: 5 }); await page.mouse.up();
    await expect(page.getByRole("toolbar", { name: "Style inspector" })).toBeVisible();

    const disclose = page.getByRole("button", { name: "More fill colors" });
    const popover = page.getByRole("group", { name: "More fill colors" });
    await disclose.click();

    // On a phone the eyedropper is only reachable through this disclosure, so a recent colour can
    // only ever arrive this way - and the colour picked is also the fill the shape now carries, so
    // it takes a slot on the bar and leaves the disclosure. Six is the limit `updateRecentColors`
    // keeps, which makes five recents, five curated colours and the eyedropper - eleven chips over
    // three rows - the most this grid can ever hold, against the five a fresh board's holds.
    let picked = 0;
    for (const recents of [0, 1, 6] as const) {
      while (picked < recents) await pickCustomColor(page, "Custom fill color", CUSTOM_COLORS[picked++]);
      const where = `${width}x${height} with ${recents} recent colours`;
      const shown = await readDisclosure(popover);
      const trigger = (await disclose.boundingBox())!;

      expect(shown.chips, `${where}: chips in the grid`).toBe(recents === 0 ? 5 : recents + 5);
      expect(shown.port, `${where}: rows on show`).toBe(rows[recents] * ROW);
      expect(shown.content, `${where}: rows held`).toBe(Math.ceil(shown.chips / 5) * ROW);

      // Inside the window on both axes, and still hung off the button that opened it.
      expect(shown.box.top, `${where}: top edge`).toBeGreaterThanOrEqual(0);
      expect(shown.box.bottom, `${where}: bottom edge`).toBeLessThanOrEqual(height);
      expect(shown.box.left, `${where}: left edge`).toBeGreaterThanOrEqual(0);
      expect(shown.box.right, `${where}: right edge`).toBeLessThanOrEqual(width);
      expect(shown.box.right, `${where}: attached to its trigger`).toBeCloseTo(Math.round(trigger.x + trigger.width), -1);

      // The eyedropper first and on its own, because it is emitted last: it is the chip a grid that
      // cannot reach its far end costs before any other, and on a phone it is the only way to a
      // colour the palette does not carry. Then every chip, pressable where the grid puts it.
      expect(shown.eyedropper, `${where}: the eyedropper reachable`).toBe(true);
      expect(shown.unreachable, `${where}: every chip reachable`).toEqual([]);

      // And the panel says so when it is keeping chips back, and says nothing when it is not - a
      // port exactly one row tall with a hidden scrollbar is otherwise a palette with the
      // eyedropper missing from it.
      await rewind(popover);
      await expect.poll(() => affordanceEdges(popover), { message: `${where}: what the panel says it is hiding` })
        .toEqual(shown.content > shown.port ? ["below"] : []);
    }

    // Which way round it is hiding them, too: an edge still reading "more below" once the user has
    // scrolled to the end is the same lie the other way up.
    const scrolled = await popover.evaluate((panel) => {
      const grid = panel.querySelector(".color-row") as HTMLElement;
      grid.scrollTop = grid.scrollHeight;
      return grid.scrollTop > 0;
    });
    await expect.poll(() => affordanceEdges(popover), { message: `${width}x${height}: scrolled to the end` })
      .toEqual(scrolled ? ["above"] : []);

    // And one chip pressed for real from the far end of the grid, which is what a scrolled port has
    // to survive: Playwright brings it into view itself and refuses to click what is painted over.
    await popover.getByRole("button", { name: "Set fill to recent color #123456" }).click();
    await expect.poll(async () => Object.values(await readStoredElements(page)).at(0)?.fillColor).toBe("#123456");
  });
}

test("leaves the landscape phone's disclosure to the bar's own vertical budget", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "One engine is enough for a height budget.");
  // 640x360 - any phone turned on its side - is the one viewport the matrix above cannot speak for.
  // The bar wraps to 231px and starts at y=10, so the palette button is itself under the fixed top
  // bar and there is nothing to open from it. That is the bar's own vertical budget, accepted for
  // this stage and filed as draftspace-style-bar-vertical-budget, not the disclosure's, and the
  // clamp above neither helps nor hurts it. Measured here so the day the bar gains a height budget
  // shows up as this expectation flipping rather than as a silent hole in the matrix.
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await page.keyboard.press("r");
  await page.mouse.move(120, 150); await page.mouse.down(); await page.mouse.move(240, 240, { steps: 5 }); await page.mouse.up();
  await expect(page.getByRole("toolbar", { name: "Style inspector" })).toBeVisible();

  const covered = await page.getByRole("button", { name: "More fill colors" }).evaluate((button) =>
    Math.round(document.querySelector(".top-bar")!.getBoundingClientRect().bottom - button.getBoundingClientRect().top));
  expect(covered, "640x360 leaves the palette button itself under the top bar").toBeGreaterThan(0);
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
  await pickCustomColor(page, "Custom fill color", "#123456");
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
