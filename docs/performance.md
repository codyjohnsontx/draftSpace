# Draftspace performance reference

## Methodology

Phase 1.2B measures deterministic schema-version-1 boards containing 100, 500, or 1,000 rectangles. The `all-visible` fixture packs every minimum-readable rectangle within one 1280×720 viewport. The `distributed` fixture spaces the same deterministic elements across a large world grid so only a small subset is visible at once. Fixtures use fixed IDs, timestamps, dimensions, positions, and styles, and are validated with the production Zod schema.

Playwright creates an isolated browser context, writes the fixture directly to IndexedDB, sets the last-opened board key, and reloads Draftspace in benchmark mode. It never uses a developer's browser profile or normal board history. The first five scene updates are warmed and discarded. Each measured run performs 30 pan/zoom updates, 50 point selections across hits and misses, 10 committed marquee gestures, and five separately saved board changes. Reports contain environment and timing metadata only—never board content.

The 100- and 500-element fixtures run once per layout. Each 1,000-element fixture runs three times. CI compares the median of the three per-run p95 values with the safety cap. Raw JSON is retained as a local or CI artifact and is not committed.

## Measurements

- `scene-render`: synchronous Canvas 2D work inside `renderScene`, including background, elements, and draft.
- `point-hit-test`: the reverse-layer selection scan on pointer-down.
- `marquee-select`: the full-containment scan when a marquee commits.
- `interaction-latency`: the first unrendered pan, zoom, move, or resize input through its corresponding canvas render.
- `indexeddb-save`: repository update through IndexedDB transaction completion.
- `board-load`: raw IndexedDB read, migration, Zod validation, and publication as the ready board; Next.js boot is excluded.

Required samples per run are 20 scene renders, 50 point hit tests, 10 marquee selections, 20 interaction latencies, five saves, and one board load. Missing samples fail the suite as broken instrumentation.

## Targets and guardrails

| Metric | Product target, p95 | CI safety cap |
|---|---:|---:|
| All-visible scene render | 32 ms | 100 ms |
| Distributed scene render | 32 ms | 100 ms |
| Point hit test | 4 ms | 20 ms |
| Marquee selection | 8 ms | 50 ms |
| Interaction latency | 50 ms | 150 ms |
| IndexedDB save | 250 ms | 1,000 ms |
| Board load | 500 ms | 1,500 ms |

Product targets guide optimization but are not initial CI gates. CI fails only for missing samples, safety-cap breaches, or benchmark workflow failures.

## Reference baseline — 2026-07-18

Reference machine: 14-inch MacBook Pro, Apple M1 Pro (10 cores), 16 GB memory, macOS; Playwright Chromium 149; 1280×720 viewport; device pixel ratio 1; reported hardware concurrency 10.

Values below are the median of three per-run p95 values for the 1,000-element fixtures.

| Metric | All-visible | Distributed | Product target | Safety cap |
|---|---:|---:|---:|---:|
| Scene render | 0.6 ms | 0.5 ms | 32 ms | 100 ms |
| Point hit test | 0.1 ms | 0.1 ms | 4 ms | 20 ms |
| Marquee selection | 0.1 ms | 0.1 ms | 8 ms | 50 ms |
| Interaction latency | 1.1 ms | 1.0 ms | 50 ms | 150 ms |
| IndexedDB save | 4.3 ms | 5.1 ms | 250 ms | 1,000 ms |
| Board load | 12.5 ms | 12.5 ms | 500 ms | 1,500 ms |

All product targets and CI safety caps passed. The baseline did not trigger viewport culling, requestAnimationFrame coalescing, hit-test allocation work beyond the prescribed simple loop and selection-set reductions, a spatial index, or autosave clone removal. There is therefore no before-and-after optimization comparison for this phase; this table is the preserved pre-optimization baseline.

## Local reproduction

```sh
npm ci
npx playwright install chromium firefox webkit
npm run build
npm run test:e2e
npm run test:performance
```

Use `PLAYWRIGHT_PORT=<port>` to avoid a local port conflict. Browser smoke defaults to port 3107 and performance defaults to 3108. Benchmark JSON and traces are written under `test-results/`.
