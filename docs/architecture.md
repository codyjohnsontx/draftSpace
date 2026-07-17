# Draftspace Architecture Decisions

## Hybrid rendering

Draftspace owns its scene model. Canvas 2D renders persistent elements and the infinite background; SVG renders selection controls and gesture guides; React renders accessible application controls. Native DOM overlays will handle text editing in Phase 2. This accepts more geometry work in exchange for predictable performance and independence from a renderer-specific document format.

## State boundaries

The board store contains only versioned, persistent document state. The session store contains tools and selection. The viewport store owns the camera. Gesture previews remain local to the canvas workspace and commit a single board transaction on pointer-up, preventing pointer frames from entering history or persistence.

## History

Meaningful operations generate Immer forward and inverse patches. The history manager stores at most 100 logical entries. Viewport motion, hover, menus, and intermediate gesture frames are excluded.

## Persistence

`BoardRepository` separates domain logic from IndexedDB and returns raw records on reads so invalid data can be preserved. The loader identifies the file format and version, runs the migration entrypoint, and validates through Zod before a document may enter board state. Invalid or future-version records remain untouched and enter the recovery flow instead.

Autosave is coordinated outside React with a 500 ms debounce, revision-aware stale-write protection, bounded retries, and lifecycle flushing. Persistence status lives in session state rather than board history. A small localStorage key records only the last-opened board ID. When IndexedDB is unavailable, Draftspace uses an explicitly labeled in-memory session and offers an emergency JSON backup.

## Schema evolution

The portable identifier is `draftspace/board`; the initial schema version is `1`. Element order is stored once in `elementIds` rather than duplicated as a layer index. Future migrations will run sequentially and validate their final output before replacing stored state.
