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
