import type { BenchmarkElementCount, BenchmarkLayout } from "./benchmark-fixtures";
import { summarizeSamples } from "./statistics";

export type PerformanceMetricName = "scene-render" | "point-hit-test" | "marquee-select" | "interaction-latency" | "indexeddb-save" | "board-load";
export interface PerformanceSample { name: PerformanceMetricName; durationMs: number; elementCount: number; visibleElementCount?: number; timestamp: number }
export interface PerformanceSummary { name: PerformanceMetricName; sampleCount: number; minimumMs: number; medianMs: number; p95Ms: number; maximumMs: number }
export interface BenchmarkReport {
  schemaVersion: 1;
  generatedAt: string;
  browser: string;
  hardwareConcurrency: number | null;
  devicePixelRatio: number;
  viewport: { width: number; height: number };
  fixture: { elementCount: BenchmarkElementCount; layout: BenchmarkLayout };
  summaries: PerformanceSummary[];
}
export interface DraftspaceBenchmarkBridge { reset(): void; getReport(): BenchmarkReport }

declare global { interface Window { __draftspaceBenchmark?: DraftspaceBenchmarkBridge } }

const metricNames: PerformanceMetricName[] = ["scene-render", "point-hit-test", "marquee-select", "interaction-latency", "indexeddb-save", "board-load"];
const samples = new Map<PerformanceMetricName, PerformanceSample[]>();
let activeFixture: BenchmarkReport["fixture"] | null = null;
let pendingInteraction: { startedAt: number; elementCount: number } | null = null;

function now() { return typeof performance === "undefined" ? Date.now() : performance.now(); }

export function initializePerformanceMonitor(search = typeof location === "undefined" ? "" : location.search): boolean {
  const parameters = new URLSearchParams(search);
  const count = Number(parameters.get("count"));
  const layout = parameters.get("layout");
  const enabled = parameters.get("benchmark") === "1" && (count === 100 || count === 500 || count === 1000) && (layout === "all-visible" || layout === "distributed");
  if (!enabled) {
    activeFixture = null; samples.clear(); pendingInteraction = null;
    if (typeof window !== "undefined") delete window.__draftspaceBenchmark;
    return false;
  }
  activeFixture = { elementCount: count as BenchmarkElementCount, layout: layout as BenchmarkLayout };
  if (typeof window !== "undefined") {
    window.__draftspaceBenchmark = { reset, getReport };
  }
  return true;
}

export function isBenchmarkMode(): boolean { return activeFixture !== null; }

export function recordPerformanceSample(sample: Omit<PerformanceSample, "timestamp"> & { timestamp?: number }): void {
  if (!activeFixture || !Number.isFinite(sample.durationMs)) return;
  const list = samples.get(sample.name) ?? [];
  list.push({ ...sample, durationMs: Math.max(0, sample.durationMs), timestamp: sample.timestamp ?? now() });
  if (list.length > 500) list.splice(0, list.length - 500);
  samples.set(sample.name, list);
}

export function measurePerformance<T>(name: PerformanceMetricName, elementCount: number, operation: () => T, visibleElementCount?: number): T {
  if (!activeFixture) return operation();
  const startedAt = now();
  try { return operation(); }
  finally { recordPerformanceSample({ name, durationMs: now() - startedAt, elementCount, visibleElementCount }); }
}

export function markInteraction(elementCount: number): void {
  if (activeFixture && pendingInteraction === null) pendingInteraction = { startedAt: now(), elementCount };
}

export function finishPendingInteraction(): void {
  if (!activeFixture || !pendingInteraction) return;
  recordPerformanceSample({ name: "interaction-latency", durationMs: now() - pendingInteraction.startedAt, elementCount: pendingInteraction.elementCount });
  pendingInteraction = null;
}

export function reset(): void { samples.clear(); pendingInteraction = null; }

export function getReport(): BenchmarkReport {
  if (!activeFixture) throw new Error("Draftspace benchmark mode is not enabled");
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    browser: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    hardwareConcurrency: typeof navigator === "undefined" || !Number.isFinite(navigator.hardwareConcurrency) ? null : navigator.hardwareConcurrency,
    devicePixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio,
    viewport: { width: typeof window === "undefined" ? 0 : window.innerWidth, height: typeof window === "undefined" ? 0 : window.innerHeight },
    fixture: activeFixture,
    summaries: metricNames.map((name) => summarizeSamples(name, samples.get(name) ?? [])),
  };
}

export function performanceNow(): number { return now(); }
