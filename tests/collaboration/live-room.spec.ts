import { expect, test, type Page } from "@playwright/test";

async function drawShape(page: Page, tool: "Rectangle" | "Ellipse", offset: number) {
  await page.getByRole("button", { name: tool }).click();
  const canvas = page.getByRole("main", { name: "Draftspace infinite canvas" });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas bounds were unavailable");
  await page.mouse.move(box.x + 260 + offset, box.y + 220 + offset);
  await page.mouse.down();
  await page.mouse.move(box.x + 390 + offset, box.y + 310 + offset);
  await page.mouse.up();
}

test("hosts an approved room with live edits, presence, roles, and personal undo", async ({ browser, browserName }) => {
  const hostContext = await browser.newContext(); const guestContext = await browser.newContext();
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  await host.goto("/");
  await expect(host.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
  await host.getByRole("button", { name: "Share board" }).click();
  await host.getByRole("textbox", { name: "Your display name" }).fill("Host");
  await host.getByRole("button", { name: "Start live room" }).click();
  const code = (await host.locator(".invite-code-block strong").textContent())?.trim();
  expect(code).toMatch(/^[0-9A-Z]{10}$/);

  await guest.goto(`/join/${code}`);
  await guest.getByRole("textbox", { name: "Your display name" }).fill("Guest");
  await guest.getByRole("button", { name: "Request to join" }).click();
  await expect(guest.getByRole("heading", { name: "Waiting for the host" })).toBeVisible();
  await host.getByRole("button", { name: "Admit as editor" }).click();
  await expect(guest.getByText("Live · Editing")).toBeVisible();

  await host.getByRole("button", { name: "Close share dialog" }).click();
  await drawShape(host, "Ellipse", 0);
  await expect(guest.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-element-count", "1");
  await drawShape(guest, "Rectangle", 40);
  await expect(host.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-element-count", "2");

  await guest.getByRole("main", { name: "Draftspace infinite canvas" }).hover({ position: { x: 500, y: 360 } });
  await expect(host.locator(".remote-cursor-label", { hasText: "Guest" })).toBeVisible();
  await guest.getByRole("button", { name: "Undo" }).click();
  await expect(host.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-element-count", "1");
  await expect(guest.getByRole("main", { name: "Draftspace infinite canvas" })).toHaveAttribute("data-element-count", "1");

  if (browserName === "chromium") {
    await host.goto("about:blank");
    await expect(guest.getByText("Host connection lost.")).toBeVisible();
    await expect(guest.getByRole("button", { name: "Rectangle" })).toBeDisabled();
    await host.goto("/");
    await expect(host.getByRole("main", { name: "Draftspace infinite canvas" })).toBeVisible();
    await expect(guest.getByText("Live · Editing")).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByText("Host connection lost.")).toBeHidden();
  }

  await host.getByRole("button", { name: "Share board" }).click();
  await host.getByRole("combobox", { name: "Role for Guest" }).selectOption("viewer");
  await expect(guest.getByText("Live · Viewing")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Rectangle" })).toBeDisabled();

  await host.getByRole("button", { name: "End room" }).click();
  await expect(guest.getByRole("heading", { name: "This room has ended" })).toBeVisible();
  await hostContext.close(); await guestContext.close();
});
