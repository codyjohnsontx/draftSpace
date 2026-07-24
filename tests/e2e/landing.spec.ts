import { expect, test } from "@playwright/test";

const SCROLL_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;

// Headless CI browsers without GPU support log this while the page takes its no-WebGL fallback path.
const isBenignWebglFailure = (text: string) => /THREE\.WebGLRenderer.*(WebGL context|WebGL creation failed)/i.test(text);

test.describe("landing page", () => {
  test("scroll-driven 3D experience loads and reaches the CTA", async ({ page }, testInfo) => {
    test.slow(); // five WebGL screenshots under software rendering take ~30s when browsers run in parallel
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !isBenignWebglFailure(message.text())) pageErrors.push(message.text());
    });

    await page.goto("/landing");
    await expect(page.getByRole("heading", { level: 1, name: "It starts as a mess." })).toBeVisible();

    const root = page.locator(".landing-root");
    await expect(root).toHaveAttribute("data-landing-ready", /webgl|fallback/, { timeout: 15_000 });
    const ready = await root.getAttribute("data-landing-ready");
    if (testInfo.project.name === "chromium") {
      expect(ready, "chromium headless should always get a WebGL context").toBe("webgl");
    }
    if (ready === "webgl") {
      await expect(page.locator("canvas.landing-canvas")).toHaveCount(1);
    }

    for (const fraction of SCROLL_FRACTIONS) {
      await page.evaluate((f) => {
        window.scrollTo(0, f * (document.documentElement.scrollHeight - window.innerHeight));
      }, fraction);
      await page.waitForTimeout(600);
      await testInfo.attach(`scroll-${fraction}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }

    await expect(page.getByRole("link", { name: "Open the canvas" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Join a room" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Join a room" })).toHaveAttribute("href", "/join");

    expect(pageErrors).toEqual([]);
  });

  test("whiteboard scroll lock is unaffected by the landing route", async ({ page }) => {
    await page.goto("/landing");
    await expect(page.locator(".landing-root")).toHaveAttribute("data-landing-ready", /webgl|fallback/, { timeout: 15_000 });
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains("landing-scroll")), { timeout: 15_000 })
      .toBe(true);

    // Client-side navigation (not a full page load) so LandingPage unmount cleanup is what removes the class.
    // Keyboard activation avoids a Linux-firefox pointer hit-test artifact while exercising the same Next.js Link path.
    const openLink = page.getByRole("link", { name: "Open the canvas" }).first();
    await openLink.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("/");
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains("landing-scroll")), { timeout: 15_000 })
      .toBe(false);
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflow).toBe("hidden");
  });

  test("reduced motion serves a static composition without errors", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/landing");
    await expect(page.locator(".landing-root")).toHaveAttribute("data-landing-ready", /webgl|fallback/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: "It starts as a mess." })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByRole("link", { name: "Join a room" })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
