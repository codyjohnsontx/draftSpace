import type { Page } from "@playwright/test";
import { createBenchmarkBoard, type BenchmarkFixtureOptions } from "@/features/performance/benchmark-fixtures";

export async function seedBenchmarkBoard(page: Page, options: BenchmarkFixtureOptions): Promise<void> {
  const board = createBenchmarkBoard(options);
  const query = `?benchmark=1&count=${options.elementCount}&layout=${options.layout}`;
  await page.goto(`/${query}`);
  await page.evaluate(async (fixture) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("draftspace", 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("boards")) request.result.createObjectStore("boards", { keyPath: "id" }).createIndex("by-updated", "updatedAt");
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("boards", "readwrite");
        transaction.objectStore("boards").put(fixture);
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
    localStorage.setItem("draftspace:last-board", fixture.id);
  }, board);
  await page.reload();
}
