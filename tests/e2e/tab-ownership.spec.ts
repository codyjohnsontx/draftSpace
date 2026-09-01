import { expect, test, type Locator, type Page } from "@playwright/test";

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

/**
 * Records the board's element count at the first moment the canvas presents itself as
 * editable. Both attributes live on the same node, so the reading cannot fall between the
 * document arriving and editing being unlocked: it sees whatever React committed together.
 */
async function watchFirstEditableRender(page: Page) {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas-workspace")!;
    const readCount = () => (canvas.dataset.readonly ? null : Number(canvas.dataset.elementCount));
    (window as unknown as { editableWith: Promise<number | null> }).editableWith = new Promise((resolve) => {
      const immediate = readCount();
      if (immediate !== null) { resolve(immediate); return; }
      const observer = new MutationObserver(() => {
        const count = readCount();
        if (count === null) return;
        observer.disconnect(); resolve(count);
      });
      observer.observe(canvas, { attributes: true, attributeFilter: ["data-readonly", "data-element-count"] });
    });
  });
}

const firstEditableRender = (page: Page) => page.evaluate(() => (window as unknown as { editableWith: Promise<number | null> }).editableWith);

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

type StorageFailures = { reads?: boolean; writes?: boolean };

/** Lets a test break this page's IndexedDB reads or writes, and mend them again, mid-session. */
const installStorageFailures = (page: Page, initial: StorageFailures = {}) => page.addInitScript((start: StorageFailures) => {
  const failing = { reads: false, writes: false, ...start };
  (window as unknown as { failDraftspaceStorage: (next: StorageFailures) => void }).failDraftspaceStorage = (next) => Object.assign(failing, next);
  const prototype = IDBObjectStore.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const read = prototype.get;
  prototype.get = function (this: IDBObjectStore, ...args: unknown[]) {
    if (failing.reads) throw new DOMException("Draftspace test blocked this read", "InvalidStateError");
    return read.apply(this, args);
  };
  for (const method of ["put", "add"]) {
    const write = prototype[method];
    prototype[method] = function (this: IDBObjectStore, ...args: unknown[]) {
      if (failing.writes) throw new DOMException("Draftspace test blocked this write", "QuotaExceededError");
      return write.apply(this, args);
    };
  }
}, initial);

const failStorage = (page: Page, next: StorageFailures) =>
  page.evaluate((value) => (window as unknown as { failDraftspaceStorage: (next: StorageFailures) => void }).failDraftspaceStorage(value), next);

type StoredBoard = { id: string; name: string; shapes: Array<{ x: number; y: number }> };

/** Every board in storage, not just the last-opened one, so a second record cannot hide. */
const storedBoards = (page: Page) => page.evaluate(async () => new Promise<StoredBoard[]>((resolve, reject) => {
  const request = indexedDB.open("draftspace");
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const all = database.transaction("boards").objectStore("boards").getAll();
    all.onsuccess = () => {
      database.close();
      resolve(all.result.map((board) => ({
        id: board.id,
        name: board.name,
        shapes: board.elementIds.map((elementId: string) => ({ x: board.elements[elementId].x, y: board.elements[elementId].y })),
      })));
    };
    all.onerror = () => { database.close(); reject(all.error); };
  };
}));

/** Rewrites the stored board as schema version 1, so the next load has a migration to write back. */
const downgradeStoredBoard = (page: Page) => page.evaluate(async () => new Promise<void>((resolve, reject) => {
  const id = localStorage.getItem("draftspace:last-board");
  const request = indexedDB.open("draftspace");
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction("boards", "readwrite");
    const store = transaction.objectStore("boards");
    const get = store.get(id!);
    get.onsuccess = () => store.put({ ...get.result, schemaVersion: 1, elements: Object.fromEntries(get.result.elementIds.map((elementId: string) => {
      const element = get.result.elements[elementId];
      return [elementId, { ...element, type: "rectangle", cornerRadius: 10 }];
    })) });
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  };
}));

async function clickStorageAction(page: Page, browserName: string, name: "Not saving" | "Retry storage") {
  const button = page.getByRole("button", { name });
  await expect(button).toBeVisible();
  // Match the storage-action workaround in board-foundation; re-evaluate after Playwright or Firefox upgrades.
  if (browserName === "firefox") await button.press("Enter"); else await button.click();
}

const retryStorage = async (page: Page, browserName: string) => {
  await clickStorageAction(page, browserName, "Not saving");
  await clickStorageAction(page, browserName, "Retry storage");
};

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

test("a promoted tab has the owner's latest work before it accepts an edit", async ({ context }) => {
  const owner = await openBoard(await context.newPage());
  await drawRectangle(owner, 200, 200, 340, 300);

  const reader = await openBoard(await context.newPage());
  await expect(saveStatus(reader)).toHaveText("View only");
  const canvas = reader.getByRole("main", { name: "Draftspace infinite canvas" });
  await expect(canvas).toHaveAttribute("data-element-count", "1");

  // The owner draws again, so the reader's copy is now a shape behind the stored board.
  await owner.bringToFront();
  await drawRectangle(owner, 200, 500, 340, 600);
  await expect(canvas).toHaveAttribute("data-element-count", "1");

  await watchFirstEditableRender(reader);
  await owner.close();

  // Unlocking editing before the reload landed would show a one-shape board the reader could
  // draw on, and the reload would then throw that drawing away.
  expect(await firstEditableRender(reader)).toBe(2);
  await expect(reader.getByRole("button", { name: "Rectangle" })).toBeEnabled();
});

test("a promoted tab that could not reload saves a copy rather than overwriting the board", async ({ browserName, context }) => {
  const owner = await openBoard(await context.newPage());
  await drawRectangle(owner, 200, 200, 340, 300);
  const originalId = await owner.evaluate(() => localStorage.getItem("draftspace:last-board"));

  const reader = await context.newPage();
  await installStorageFailures(reader);
  await openBoard(reader);
  await expect(saveStatus(reader)).toHaveText("View only");

  // The owner draws past what the reader holds, then lets the board go while the reader cannot
  // read: the reader is promoted onto a stale document it had no way to refresh.
  await owner.bringToFront();
  await drawRectangle(owner, 200, 500, 340, 600);
  await failStorage(reader, { reads: true });
  await owner.close();
  await expect(saveStatus(reader)).toHaveText("Not saving");

  await failStorage(reader, { reads: false });
  await reader.bringToFront();
  await drawRectangle(reader, 700, 200, 840, 300);
  await retryStorage(reader, browserName);

  await expect(saveStatus(reader)).toHaveText("Saved as a copy");
  const boards = await storedBoards(reader);
  const original = boards.find((board) => board.id === originalId);
  const copy = boards.find((board) => board.id !== originalId);
  expect(original?.shapes).toEqual([{ x: 200, y: 200 }, { x: 200, y: 500 }]);
  expect(copy?.shapes).toEqual([{ x: 200, y: 200 }, { x: 700, y: 200 }]);
  expect(copy?.name).toBe(`${original?.name} (recovered copy)`);
  expect(await reader.evaluate(() => localStorage.getItem("draftspace:last-board"))).toBe(copy?.id);
});

test("a second retry after the other tab closes still does not overwrite its work", async ({ browserName, context }) => {
  const stranded = await openBoard(await context.newPage());
  await drawRectangle(stranded, 200, 200, 340, 300);
  const originalId = await stranded.evaluate(() => localStorage.getItem("draftspace:last-board"));

  // A migration this tab cannot write back is the way into session-only with a real board open.
  await downgradeStoredBoard(stranded);
  await installStorageFailures(stranded, { writes: true });
  await stranded.reload();
  await expect(saveStatus(stranded)).toHaveText("Not saving");
  await drawRectangle(stranded, 700, 200, 840, 300);
  await failStorage(stranded, { writes: false });

  const owner = await openBoard(await context.newPage());
  await expect(saveStatus(owner)).toHaveText("Saved locally");
  await drawRectangle(owner, 200, 500, 340, 600);

  // First retry: the board is claimed, so nothing is written and the draft stays put.
  await stranded.bringToFront();
  await retryStorage(stranded, browserName);
  await expect(saveStatus(stranded)).toHaveText("Not saving");
  await clickStorageAction(stranded, browserName, "Not saving");
  await expect(stranded.getByRole("dialog", { name: "Another tab is editing this board" })).toBeVisible();
  await stranded.keyboard.press("Escape");

  // Second retry: the claim is free now, but the stored board has moved on regardless.
  await owner.close();
  await retryStorage(stranded, browserName);

  await expect(saveStatus(stranded)).toHaveText("Saved as a copy");
  const boards = await storedBoards(stranded);
  const original = boards.find((board) => board.id === originalId);
  const copy = boards.find((board) => board.id !== originalId);
  expect(original?.shapes).toEqual([{ x: 200, y: 200 }, { x: 200, y: 500 }]);
  expect(copy?.shapes).toEqual([{ x: 200, y: 200 }, { x: 700, y: 200 }]);
  expect(await stranded.evaluate(() => localStorage.getItem("draftspace:last-board"))).toBe(copy?.id);
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

// Firefox on Linux CI mis-hit-tests DOM overlaid on the accelerated canvas layer, so it activates
// the switcher's controls directly. Mirrors the workaround in board-switching.spec.ts.
async function activate(browserName: string, target: Locator) {
  await expect(target).toBeVisible();
  if (browserName === "firefox") { await target.dispatchEvent("click"); return; }
  await target.click();
}

const boardName = (page: Page) => page.getByRole("textbox", { name: "Board name" });

async function switchToBoard(page: Page, browserName: string, name: string) {
  await activate(browserName, page.getByRole("button", { name: "Open a board" }));
  await activate(browserName, page.getByRole("menuitemradio", { name: new RegExp(name) }));
}

/** Leaves a second board behind the way a user gets one, then opens a fresh one beside it. */
async function startASecondBoard(page: Page, name: string) {
  await page.evaluate(() => localStorage.removeItem("draftspace:last-board"));
  await page.reload();
  await expect(page.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await boardName(page).fill(name); await boardName(page).press("Enter");
}

test("the claim follows a board switch rather than leaving two writers on one board", async ({ browserName, context }) => {
  const owner = await openBoard(await context.newPage());
  await boardName(owner).fill("First board"); await boardName(owner).press("Enter");
  await drawRectangle(owner, 200, 200, 340, 300);
  await startASecondBoard(owner, "Second board");
  await drawRectangle(owner, 600, 200, 740, 300);

  // The switcher is how a read-only tab reaches a board it can have, so it stays available to one.
  const reader = await openBoard(await context.newPage());
  await expect(reader.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-readonly", "true");
  await switchToBoard(reader, browserName, "First board");
  await expect(boardName(reader)).toHaveValue("First board");
  await expect(reader.getByRole("main", { name: "Draftspace infinite canvas" })).not.toHaveAttribute("data-readonly");
  await drawRectangle(reader, 300, 450, 440, 550);

  // Switching onto a board another tab holds must open it read-only, not start a second autosave.
  await switchToBoard(owner, browserName, "First board");
  await expect(boardName(owner)).toHaveValue("First board");
  await expect(owner.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-readonly", "true");
  await expect(saveStatus(owner)).toHaveText("View only");
  const before = await storedBoards(owner);
  await drawRectangle(owner, 800, 450, 940, 550);
  expect(await storedBoards(owner)).toEqual(before);
});
