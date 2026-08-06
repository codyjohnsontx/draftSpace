# Draftspace performance reference

## Methodology

The benchmark suite measures deterministic boards at the current board schema version containing 100, 500, or 1,000 rectangles. Rectangles remain the benchmark element type so Phase 2.1A can be compared with the Phase 1.2B baseline. The `all-visible` fixture packs every minimum-readable rectangle within one 1280×720 viewport. The `distributed` fixture spaces the same deterministic elements across a large world grid so only a small subset is visible at once. Fixtures use fixed IDs, timestamps, dimensions, positions, and styles, and are validated with the production Zod schema.

Playwright creates an isolated browser context, writes the fixture directly to IndexedDB, sets the last-opened board key, and reloads Draftspace in benchmark mode. It never uses a developer's browser profile or normal board history. The first five scene updates are warmed and discarded. Each measured run performs 30 pan/zoom updates, 50 point selections across hits and misses, 10 committed marquee gestures, five separately saved board changes, and a pointer sweep across content and empty canvas with the connector tool armed. Reports contain environment and timing metadata only, never board content.

The 100- and 500-element fixtures run once per layout. Each 1,000-element fixture runs three times. CI compares the median of the three per-run p95 values with the safety cap. Raw JSON is retained as a local or CI artifact and is not committed.

## Measurements

- `scene-render`: synchronous Canvas 2D work inside `renderScene`, including background, elements, and draft.
- `point-hit-test`: the reverse-layer selection scan on pointer-down.
- `connect-pick`: the reverse-layer anchor scan on every pointer move while the connector tool is armed; hovering empty canvas visits every element.
- `marquee-select`: the full-containment scan when a marquee commits.
- `interaction-latency`: the first unrendered pan, zoom, move, or resize input through its corresponding canvas render.
- `indexeddb-save`: repository update through IndexedDB transaction completion.
- `board-load`: raw IndexedDB read, migration, Zod validation, and publication as the ready board; Next.js boot is excluded.

Required samples per run are 20 scene renders, 50 point hit tests, 30 connector-hover picks, 10 marquee selections, 20 interaction latencies, five saves, and one board load. Missing samples fail the suite as broken instrumentation.

## Targets and guardrails

| Metric | Product target, p95 | CI safety cap |
|---|---:|---:|
| All-visible scene render | 32 ms | 100 ms |
| Distributed scene render | 32 ms | 100 ms |
| Point hit test | 4 ms | 20 ms |
| Connector hover pick | 4 ms | 20 ms |
| Marquee selection | 8 ms | 50 ms |
| Interaction latency | 50 ms | 150 ms |
| IndexedDB save | 250 ms | 1,000 ms |
| Board load | 500 ms | 1,500 ms |

Product targets guide optimization but are not initial CI gates. CI fails only for missing samples, safety-cap breaches, or benchmark workflow failures.

## Reference baseline — 2026-07-18

Reference machine: 14-inch MacBook Pro, Apple M1 Pro (10 cores), 16 GB memory, macOS; Playwright Chromium 149; 1280×720 viewport; device pixel ratio 1; reported hardware concurrency 10.

This preserved Phase 1.2B reference used schema-version-1 rectangle fixtures. Current fixtures serialize the same rectangle workload at the current schema version (see [`architecture.md`](architecture.md)); the benchmark report schema remains version 1 because its format is independent of board documents.

Values below are the median of three per-run p95 values for the 1,000-element fixtures.

| Metric | All-visible | Distributed | Product target | Safety cap |
|---|---:|---:|---:|---:|
| Scene render | 0.6 ms | 0.5 ms | 32 ms | 100 ms |
| Point hit test | 0.1 ms | 0.1 ms | 4 ms | 20 ms |
| Connector hover pick | not measured | not measured | 4 ms | 20 ms |
| Marquee selection | 0.1 ms | 0.1 ms | 8 ms | 50 ms |
| Interaction latency | 1.1 ms | 1.0 ms | 50 ms | 150 ms |
| IndexedDB save | 4.3 ms | 5.1 ms | 250 ms | 1,000 ms |
| Board load | 12.5 ms | 12.5 ms | 500 ms | 1,500 ms |

Every metric measured at the time passed its product target and CI safety cap. The connector hover pick postdates this baseline: it was added with the Phase 3 connector work and first measured then, so it has no Phase 1.2B value to compare against. Measured by the documented `npm run test:performance` method on the reference machine named above, with nothing else loading it, the current allocation-free pick reports a median-of-three per-run p95 of roughly 0.1 to 0.2 ms all-visible and 0.2 to 0.4 ms distributed on the 1,000-element fixtures. Restoring the previous allocating scan and re-measuring under the same quiet conditions gives roughly 0.7 to 1.6 ms all-visible and 1.3 to 1.9 ms distributed, so removing the per-candidate allocations is worth roughly 6x to 9x on this workload. Each range spans three separate executions of the benchmark, run as an A/B/A across the two code versions so build drift cannot account for the gap. Ranges are recorded rather than single figures because Chromium quantizes every timing sample to 0.1 ms and the typical pick falls below that resolution, which leaves this p95 a tail reading that moves by a tenth or two between otherwise identical runs.

An earlier revision of this section recorded 3.2 ms all-visible and 2.5 ms distributed for the same metric. That run shared the machine with several other agents, so it measured contention rather than the code, and the quiet-machine numbers above replace it. A later revision recorded single figures of 0.10 ms / 0.10 ms current and 0.30 ms / 0.60 ms pre-optimization, each from one execution; the three-execution ranges above supersede those as well. Treat both older readings as withdrawn rather than as regressions to restore.

The baseline did not trigger viewport culling, requestAnimationFrame coalescing, hit-test allocation work beyond the prescribed simple loop and selection-set reductions, a spatial index, or autosave clone removal. There is therefore no before-and-after optimization comparison for this phase; this table is the preserved pre-optimization baseline.

## Local reproduction

```sh
npm ci
npx playwright install chromium firefox webkit
npm run build
npm run test:e2e
npm run test:performance
```

Use `PLAYWRIGHT_PORT=<port>` to avoid a local port conflict. Browser smoke defaults to port 3107 and performance defaults to 3108. Benchmark JSON and traces are written under `test-results/`.
