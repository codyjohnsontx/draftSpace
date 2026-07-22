# Draftspace Architecture Decisions

## Hybrid rendering

Draftspace owns its scene model. Canvas 2D renders persistent elements and the infinite background; SVG renders selection controls and gesture guides; React renders accessible application controls. Native DOM overlays will handle text editing in Phase 2. This accepts more geometry work in exchange for predictable performance and independence from a renderer-specific document format.

Canvas-domain work is kept outside React. `renderScene` owns clearing, background and element drawing, draft drawing, and rendered-element counts. Pure geometry modules own hit testing, marquee containment, viewport bounds, and visibility intersection. `SceneCanvas` retains only canvas ownership, backing-buffer sizing, the device-pixel-ratio transform, React lifecycle integration, and timing around the pure renderer.

Rectangles, ellipses, and diamonds form a discriminated shape union over shared bounds and style fields. A shared path builder keeps persistent rendering and draft previews consistent. Point hit testing follows each visible silhouette, while marquee selection deliberately retains full bounding-box containment so group selection behavior stays predictable.

## State boundaries

The board store contains only versioned, persistent document state. The session store contains tools, selection, and derived style previews. The viewport store owns the camera. Geometry gesture previews remain local to the canvas workspace, while inspector previews are shared session state so React controls and Canvas 2D render the same pending value. Both preview paths commit a single board transaction at completion, preventing intermediate frames from entering history or persistence.

Inspector layout and recent colors are application preferences stored under a validated, versioned localStorage key. They are not board preferences and never enter IndexedDB documents, board exports, clipboard payloads, history, or benchmark reports. Invalid or unavailable preference storage falls back to in-memory floating-mode defaults without blocking the canvas. Desktop sidebar mode reserves canvas width; the same preference becomes a non-modal overlay at narrow widths.

## History

Meaningful operations generate Immer forward and inverse patches. The history manager stores at most 100 logical entries. A discrete style choice is one operation; continuous opacity, corner, and custom-color input is previewed in session state and becomes one operation on completion. Viewport motion, hover, menus, application preferences, and intermediate gesture or style frames are excluded.

## Persistence

`BoardRepository` separates domain logic from IndexedDB and returns raw records on reads so invalid data can be preserved. The loader identifies the file format and version, runs the migration entrypoint, and validates through Zod before a document may enter board state. Invalid or future-version records remain untouched and enter the recovery flow instead.

Autosave is coordinated outside React with a 500 ms debounce, revision-aware stale-write protection, bounded retries, and lifecycle flushing. The dedicated Zustand persistence store owns persistence status rather than board history. A small localStorage key records only the last-opened board ID. When IndexedDB is unavailable, Draftspace uses an explicitly labeled in-memory session and offers an emergency JSON backup.

## Performance instrumentation

Instrumentation is derived, non-persistent session state. It activates only for a valid `benchmark=1` URL with a supported fixture count and layout. Normal sessions create no benchmark bridge, collect no samples, change no document fields, persist no metrics, and make no reporting requests. Benchmark mode keeps at most 500 samples per metric and exposes only reset and summarized-report operations to Playwright.

The 1,000-element baseline meets the Phase 1.2B product targets without conditional optimizations. Viewport culling, requestAnimationFrame coalescing, and a derived uniform-grid spatial index therefore remain unimplemented. If a future measured baseline requires the spatial index, it is session-only derived state, rebuilt by board revision, and never part of the portable board schema.

## Browser capability boundary

Canvas 2D is the only browser capability that blocks the working surface. Without it, Draftspace replaces the canvas with an accessible support screen and offers an emergency backup when a validated board is loaded. Resize observation, structured cloning, ID generation, rounded rectangle paths, and clipboard access use focused local fallbacks. Blob downloads retain the existing backup failure path; service workers remain optional; and IndexedDB retains the Phase 1.2A session-only behavior. No general polyfill package is used.

## Schema evolution

The portable identifier is `draftspace/board`; the current schema version is `2`. Version 2 adds ellipse and diamond element variants. Version-1 rectangle boards migrate by changing only the schema version, then pass through the complete production schema before entering board state or being written back. If migration write-back fails, the validated board remains usable in session-only mode. The IndexedDB database remains version 1 because document schema evolution does not require an object-store change. Element order is stored once in `elementIds` rather than duplicated as a layer index. Future migrations run sequentially and validate their final output before replacing stored state.
