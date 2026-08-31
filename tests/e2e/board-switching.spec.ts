import { expect, test, type Locator, type Page } from "@playwright/test";

// Firefox on Linux CI mis-hit-tests DOM overlaid on the accelerated canvas layer and reports the
// canvas as intercepting clicks that land fine for real users, so it activates controls directly.
async function activate(browserName: string, target: Locator) {
  await expect(target).toBeVisible();
  if (browserName === "firefox") { await target.dispatchEvent("click"); return; }
  await target.click();
}

const canvasOf = (page: Page) => page.getByRole("main", { name: "Draftspace infinite canvas" });
const boardName = (page: Page) => page.getByRole("textbox", { name: "Board name" });
const boardMenu = (page: Page) => page.getByRole("menu", { name: "Boards in this browser" });
const boardOption = (page: Page, name: RegExp) => page.getByRole("menuitemradio", { name });

async function openBoardMenu(page: Page, browserName: string) {
  await activate(browserName, page.getByRole("button", { name: "Open a board" }));
  await expect(boardMenu(page)).toBeVisible();
}

/** Every stored board, straight out of IndexedDB, so assertions never rest on what is on screen. */
const storedBoards = (page: Page) => page.evaluate(async () => new Promise<{ id: string; name: string; elements: number }[]>((resolve, reject) => {
  const request = indexedDB.open("draftspace");
  request.onerror = () => reject(request.error);
  // Opening without a version creates the database when it is absent, and an empty one at version 1
  // would stop the app's own upgrade from ever running its object store. Abort the version-change
  // transaction so reading the boards can never be what leaves this origin without them.
  request.onupgradeneeded = () => request.transaction?.abort();
  request.onsuccess = () => {
    const db = request.result;
    // The store can also be missing on a database this did not create, and `transaction` throws
    // here when it is. Reject, or the poll below just waits out its timeout.
    try {
      const all = db.transaction("boards").objectStore("boards").getAll();
      all.onsuccess = () => { db.close(); resolve(all.result.map((doc) => ({ id: doc.id, name: doc.name, elements: doc.elementIds.length }))); };
      all.onerror = () => { db.close(); reject(all.error); };
    } catch (error) { db.close(); reject(error); }
  };
}));

/**
 * The whole point of the feature: a browser that ends up holding two boards can reach either one.
 *
 * The second board is not seeded. It arrives the way a user gets one - the last-opened board is
 * remembered in a single localStorage key, and losing it (storage eviction, clearing site data)
 * leaves the stored board behind and starts a fresh one beside it. Before this change that first
 * board was gone for good the moment the tab holding it reloaded.
 */
test("keeps both boards reachable once a browser holds more than one", async ({ browserName, context, page }, testInfo) => {
  await page.goto("/");
  await expect(canvasOf(page)).toHaveAttribute("data-board-ready", "true");
  await boardName(page).fill("Original board");
  await boardName(page).press("Enter");
  await page.keyboard.press("r");
  await page.mouse.move(220, 200); await page.mouse.down(); await page.mouse.move(360, 300, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => canvasOf(page).getAttribute("data-element-count")).toBe("1");
  const originalId = await page.evaluate(() => localStorage.getItem("draftspace:last-board"));
  expect(originalId).toBeTruthy();
  // Past the autosave debounce, so the work is genuinely on disk before anything else reads it.
  await expect.poll(storedBoards.bind(null, page)).toEqual([{ id: originalId, name: "Original board", elements: 1 }]);

  // One board, so there is nothing to switch to and no control offering to.
  await expect(page.getByRole("button", { name: "Open a board" })).toHaveCount(0);

  // The pointer to the last-opened board is lost while the board itself survives.
  await page.evaluate(() => localStorage.removeItem("draftspace:last-board"));

  // The next tab therefore starts a board of its own, beside the one already stored.
  const other = await context.newPage();
  await other.goto("/");
  await expect(canvasOf(other)).toHaveAttribute("data-element-count", "0");
  await expect(boardName(other)).toHaveValue("My first draft");
  expect(await other.evaluate(() => localStorage.getItem("draftspace:last-board"))).not.toBe(originalId);

  // Both boards are named, and the one on screen is the one marked.
  await openBoardMenu(other, browserName);
  await expect(boardOption(other, /Original board/)).toHaveAttribute("aria-checked", "false");
  await expect(boardOption(other, /My first draft/)).toHaveAttribute("aria-checked", "true");
  await expect(boardOption(other, /Original board/)).toContainText("1 element");
  await other.waitForTimeout(300);
  await other.screenshot({ path: testInfo.outputPath("draftspace-board-switcher.png") });

  // The board that used to be stranded opens, with its work on it.
  await activate(browserName, boardOption(other, /Original board/));
  await expect(boardName(other)).toHaveValue("Original board");
  await expect(canvasOf(other)).toHaveAttribute("data-element-count", "1");
  await expect(boardMenu(other)).toHaveCount(0);

  // Reloading returns to the chosen board rather than to a default.
  await other.reload();
  await expect(boardName(other)).toHaveValue("Original board");
  await expect(canvasOf(other)).toHaveAttribute("data-element-count", "1");

  // And the other one is still reachable from there, so neither board is a dead end.
  await openBoardMenu(other, browserName);
  await activate(browserName, boardOption(other, /My first draft/));
  await expect(boardName(other)).toHaveValue("My first draft");
  await expect(canvasOf(other)).toHaveAttribute("data-element-count", "0");
  await other.close();

  // The first tab, reloaded, lands on the last board chosen and still reaches the original.
  await page.reload();
  await expect(boardName(page)).toHaveValue("My first draft");
  await openBoardMenu(page, browserName);
  await activate(browserName, boardOption(page, /Original board/));
  await expect(boardName(page)).toHaveValue("Original board");
  await expect(canvasOf(page)).toHaveAttribute("data-element-count", "1");

  // Nothing was rewritten to make that work: both records are still their own documents.
  const stored = await storedBoards(page);
  expect(stored).toHaveLength(2);
  expect(stored.find((doc) => doc.id === originalId)).toEqual({ id: originalId, name: "Original board", elements: 1 });
});
