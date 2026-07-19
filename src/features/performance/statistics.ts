import type { PerformanceMetricName, PerformanceSample, PerformanceSummary } from "./performance-monitor";

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeSamples(name: PerformanceMetricName, samples: readonly PerformanceSample[]): PerformanceSummary {
  const durations = samples.filter((sample) => sample.name === name).map((sample) => sample.durationMs);
  return {
    name,
    sampleCount: durations.length,
    minimumMs: durations.length ? Math.min(...durations) : 0,
    medianMs: median(durations),
    p95Ms: percentile(durations, .95),
    maximumMs: durations.length ? Math.max(...durations) : 0,
  };
}
