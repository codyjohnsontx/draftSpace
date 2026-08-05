import { expect, test, type Page } from "@playwright/test";

const storedShapePositions = (page: Page) => page.evaluate(async () => new Promise<Array<{ x: number; y: number }>>((resolve, reject) => {
  const id = localStorage.getItem("draftspace:last-board");
  const request = indexedDB.open("draftspace");
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const get = database.transaction("boards").objectStore("boards").get(id!);
    get.onsuccess = () => {
      database.close();
      const board = get.result;
      resolve(board ? board.elementIds.map((elementId: string) => ({ x: board.elements[elementId].x, y: board.elements[elementId].y })) : []);
    };
    get.onerror = () => { database.close(); reject(get.error); };
  };
}));

async function openBoard(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  return page;
}

async function drawRectangle(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.keyboard.press("r");
  await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2); await page.mouse.up();
  await page.waitForTimeout(800); // past the autosave debounce
}

const saveStatus = (page: Page) => page.locator(".save-status");

test("a second tab on the same board cannot overwrite the first tab's work", async ({ context }) => {
  const owner = await openBoard(await context.newPage());
  await drawRectangle(owner, 200, 200, 340, 300);
  await expect(saveStatus(owner)).toHaveText("Saved locally");

  const reader = await openBoard(await context.newPage());
  await expect(saveStatus(reader)).toHaveText("View only");
  await expect(reader.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-readonly", "true");
  await expect(reader.locator(".board-access-banner")).toContainText("Another tab is editing this board");
  await expect(reader.getByRole("button", { name: "Rectangle" })).toBeDisabled();
  await expect(reader.getByLabel("Board name")).toBeDisabled();

  // The reader tries every way it has to change the board.
  await drawRectangle(reader, 700, 200, 840, 300);
  await reader.keyboard.press("ControlOrMeta+a");
  await reader.keyboard.press("Delete");
  await reader.waitForTimeout(800);
  expect(await storedShapePositions(reader)).toEqual([{ x: 200, y: 200 }]);

  // The owner keeps working, and keeps all of it.
  await owner.bringToFront();
  await drawRectangle(owner, 200, 500, 340, 600);
  expect(await storedShapePositions(owner)).toEqual([{ x: 200, y: 200 }, { x: 200, y: 500 }]);
  await expect(saveStatus(owner)).toHaveText("Saved locally");
});

test("the surviving tab takes over when the owning tab goes away", async ({ context }) => {
  const owner = await openBoard(await context.newPage());
  await drawRectangle(owner, 200, 200, 340, 300);

  const reader = await openBoard(await context.newPage());
  await expect(saveStatus(reader)).toHaveText("View only");

  await owner.close();
  await expect(saveStatus(reader)).toHaveText("Saved locally");
  await expect(reader.locator(".board-access-banner")).toContainText("You can edit again");
  await expect(reader.getByRole("button", { name: "Rectangle" })).toBeEnabled();

  // It picked up the owner's work rather than writing its own stale copy over it.
  await drawRectangle(reader, 700, 200, 840, 300);
  expect(await storedShapePositions(reader)).toEqual([{ x: 200, y: 200 }, { x: 700, y: 200 }]);
});

test("one tab alone owns its board with no banner and no prompt", async ({ page }) => {
  await openBoard(page);
  await expect(saveStatus(page)).not.toHaveText("View only");
  await expect(page.locator(".board-access-banner")).toHaveCount(0);
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).not.toHaveAttribute("data-readonly");
  await expect(page.getByRole("button", { name: "Rectangle" })).toBeEnabled();
  await drawRectangle(page, 260, 180, 460, 300);
  expect(await storedShapePositions(page)).toEqual([{ x: 260, y: 180 }]);
});

test("a board reopened after its owning tab vanished is editable again", async ({ context }) => {
  // A tab that never releases its lease stands in for one lost to a crash: a new context
  // is a new browser process, which is what a force-quit and restart amounts to.
  const first = await openBoard(await context.newPage());
  await drawRectangle(first, 200, 200, 340, 300);
  const boardId = await first.evaluate(() => localStorage.getItem("draftspace:last-board"));
  await first.close();

  const reopened = await openBoard(await context.newPage());
  expect(await reopened.evaluate(() => localStorage.getItem("draftspace:last-board"))).toBe(boardId);
  await expect(saveStatus(reopened)).toHaveText("Saved locally");
  await expect(reopened.locator(".board-access-banner")).toHaveCount(0);
  await drawRectangle(reopened, 700, 200, 840, 300);
  expect(await storedShapePositions(reopened)).toEqual([{ x: 200, y: 200 }, { x: 700, y: 200 }]);
});
