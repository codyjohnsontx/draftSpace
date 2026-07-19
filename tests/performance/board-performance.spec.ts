import fs from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { median } from "@/features/performance/statistics";
import type { BenchmarkFixtureOptions } from "@/features/performance/benchmark-fixtures";
import type { BenchmarkReport, PerformanceMetricName, PerformanceSummary } from "@/features/performance/performance-monitor";
import { seedBenchmarkBoard } from "./helpers/seed-benchmark-board";

const requiredSamples: Record<PerformanceMetricName, number> = {
  "scene-render": 20, "point-hit-test": 50, "marquee-select": 10,
  "interaction-latency": 20, "indexeddb-save": 5, "board-load": 1,
};
const safetyCaps: Record<PerformanceMetricName, number> = {
  "scene-render": 100, "point-hit-test": 20, "marquee-select": 50,
  "interaction-latency": 150, "indexeddb-save": 1000, "board-load": 1500,
};

async function report(page: Page): Promise<BenchmarkReport> {
  return page.evaluate(() => {
    if (!window.__draftspaceBenchmark) throw new Error("Benchmark bridge was not installed");
    return window.__draftspaceBenchmark.getReport();
  });
}

function replaceSummary(reportValue: BenchmarkReport, summary: PerformanceSummary): BenchmarkReport {
  return { ...reportValue, summaries: reportValue.summaries.map((candidate) => candidate.name === summary.name ? summary : candidate) };
}

async function runFixture(page: Page, testInfo: TestInfo, options: BenchmarkFixtureOptions, run: number): Promise<BenchmarkReport> {
  await seedBenchmarkBoard(page, options);
  await expect(page.locator('[data-board-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-testid="scene-canvas"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.__draftspaceBenchmark))).toBe(true);
  const loadSummary = (await report(page)).summaries.find((summary) => summary.name === "board-load")!;

  // Warm the scene, then clear application-owned timing samples. Board load is retained in the test-side report.
  for (let index = 0; index < 5; index += 1) { await page.mouse.wheel(index % 2 ? -2 : 2, 0); await page.waitForTimeout(20); }
  await page.evaluate(() => window.__draftspaceBenchmark!.reset());

  for (let index = 0; index < 30; index += 1) {
    if (index % 2 === 0) await page.mouse.wheel(index % 4 ? -8 : 8, 0);
    else await page.mouse.wheel(0, index % 4 ? -5 : 5);
    await page.waitForTimeout(20);
  }
  await page.getByRole("button", { name: "Reset zoom to 100%" }).click();
  await page.waitForTimeout(30);

  const hit = options.layout === "all-visible" ? { x: 100, y: 80 } : { x: 500, y: 380 };
  for (let index = 0; index < 50; index += 1) {
    await page.mouse.click(index % 2 === 0 ? hit.x : 1260, index % 2 === 0 ? hit.y : 690);
  }
  for (let index = 0; index < 10; index += 1) {
    await page.mouse.move(1100, 610); await page.mouse.down(); await page.mouse.move(1240, 690); await page.mouse.up();
  }

  if (options.layout === "distributed") {
    await page.mouse.move(450, 330); await page.mouse.down(); await page.mouse.move(640, 460); await page.waitForTimeout(25); await page.mouse.up();
  } else await page.mouse.click(hit.x, hit.y);
  await expect(page.locator("[data-resize-handle]")).toHaveCount(8);
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press(index % 2 ? "ArrowLeft" : "ArrowRight");
    await page.waitForTimeout(650);
  }

  const collected = replaceSummary(await report(page), loadSummary);
  for (const [name, minimum] of Object.entries(requiredSamples) as [PerformanceMetricName, number][]) {
    const summary = collected.summaries.find((candidate) => candidate.name === name);
    expect(summary?.sampleCount, `${name} sample count`).toBeGreaterThanOrEqual(minimum);
  }
  const json = JSON.stringify(collected, null, 2);
  await testInfo.attach(`benchmark-${options.elementCount}-${options.layout}-run-${run}.json`, { body: Buffer.from(json), contentType: "application/json" });
  const output = testInfo.outputPath(`benchmark-${options.elementCount}-${options.layout}-run-${run}.json`);
  await fs.writeFile(output, json);
  return collected;
}

for (const elementCount of [100, 500, 1000] as const) {
  for (const layout of ["all-visible", "distributed"] as const) {
    test(`${elementCount} elements / ${layout}`, async ({ page }, testInfo) => {
      test.setTimeout(elementCount === 1000 ? 120_000 : 60_000);
      const options = { elementCount, layout };
      const runCount = elementCount === 1000 ? 3 : 1;
      const reports: BenchmarkReport[] = [];
      for (let run = 1; run <= runCount; run += 1) reports.push(await runFixture(page, testInfo, options, run));
      if (elementCount === 1000) {
        for (const [name, cap] of Object.entries(safetyCaps) as [PerformanceMetricName, number][]) {
          const perRunP95 = reports.map((item) => item.summaries.find((summary) => summary.name === name)!.p95Ms);
          expect(median(perRunP95), `${name} median per-run p95`).toBeLessThanOrEqual(cap);
        }
      }
      const summaryPath = testInfo.outputPath(`benchmark-${elementCount}-${layout}-summary.json`);
      await fs.writeFile(summaryPath, JSON.stringify({ schemaVersion: 1, fixture: options, runs: reports }, null, 2));
    });
  }
}
