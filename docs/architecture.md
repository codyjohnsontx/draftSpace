# Draftspace Architecture Decisions

## Hybrid rendering

Draftspace owns its scene model. Canvas 2D renders persistent elements and the infinite background; SVG renders selection controls and gesture guides; React renders accessible application controls. Native DOM overlays will handle text editing in Phase 2. This accepts more geometry work in exchange for predictable performance and independence from a renderer-specific document format.

## State boundaries

The board store contains only versioned, persistent document state. The session store contains tools and selection. The viewport store owns the camera. Gesture previews remain local to the canvas workspace and commit a single board transaction on pointer-up, preventing pointer frames from entering history or persistence.

## History

Meaningful operations generate Immer forward and inverse patches. The history manager stores at most 100 logical entries. Viewport motion, hover, menus, and intermediate gesture frames are excluded.

## Persistence

`BoardRepository` separates domain logic from IndexedDB. Stored data is validated through Zod before entering application state. Autosave follows committed revisions with a 500 ms debounce, and a small localStorage key records only the last-opened board ID.

## Schema evolution

The portable identifier is `draftspace/board`; the initial schema version is `1`. Element order is stored once in `elementIds` rather than duplicated as a layer index. Future migrations will run sequentially and validate their final output before replacing stored state.
