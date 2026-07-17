# Draftspace Product Roadmap

This roadmap favors interaction trust over feature count. Draftspace should earn confidence as a thinking surface before it expands into a broad diagramming suite.

## Assumptions and product challenges

- **Reliability is the first retention feature.** Users will not adopt more drawing tools if a canceled gesture, reload, or save can change their work unexpectedly.
- **Desktop pointer workflows are the first quality bar.** Touch editing remains out of scope until mouse and trackpad behavior are dependable.
- **Local-first is a real product promise.** Recovery, portability, and explicit save state matter more than account or sharing features in the near term.
- **1,000 ordinary elements is the initial performance target.** Optimization work must be driven by repeatable measurements, not speculative infrastructure.
- **Connectors are the first major differentiator.** They begin only after core transformations and text editing share stable geometry and history contracts.

## Success signals

- Critical Playwright workflows pass without retries.
- One completed gesture produces one history entry; canceled gestures produce none.
- A restored board returns to the last saved document and viewport.
- Pointer interactions remain responsive on the 1,000-element benchmark board.
- Invalid local or imported data never replaces a valid open board.

## Phase 1.1 — Interaction hardening

**Goal:** Make the existing rectangle workflow feel stable enough for daily use.

- Shift/Alt modifier-aware resizing
- Conservative mouse-wheel zoom and two-axis trackpad panning
- Escape, pointer-cancel, and window-blur gesture cancellation
- Viewport restoration and debounced persistence outside undo history
- Live grid snapping with visible indicators
- High-contrast selection outlines and resize handles
- Expanded move, resize, cancel, viewport, and clipboard tests

**Acceptance:** Given an active gesture, when it is canceled, then document state and history remain unchanged. Given a saved viewport, when the board reloads, then the same world position and zoom are restored. Given grid snapping, when an object is created or moved, then its preview and committed result agree.

## Phase 1.2 — Reliability and performance

**Goal:** Make local work resilient under storage failures and large boards.

- Flush pending saves on visibility changes
- Save retry control and actionable error messages
- Corrupt-data recovery without overwriting raw records
- Browser capability fallbacks
- 100/500/1,000-element benchmark fixtures
- Render, hit-test, save, and interaction-latency instrumentation
- Broader browser smoke coverage

**Acceptance:** Failed saves preserve in-memory work and can be retried. Corrupt records remain recoverable. The 1,000-element fixture remains usable and reports benchmark data.

## Phase 2.1 — Core shapes and styling

**Goal:** Expand visual vocabulary without weakening the interaction model.

- Ellipse and diamond tools
- Straight lines
- Rotation
- Contextual inspector
- Stroke, fill, width, style, opacity, and corner-radius controls
- Curated and recent colors

**Acceptance:** Every new shape uses the same selection, transformation, history, clipboard, persistence, and export contracts as rectangles.

## Phase 2.2 — Text, notes, and freehand

**Goal:** Support brainstorming, annotation, and low-fidelity interface work.

- Native DOM text editor overlay
- Bound shape text
- Sticky notes
- Freehand strokes with point simplification
- Eraser behavior
- Typography and stroke controls

**Acceptance:** Text editing suppresses global shortcuts and never loses committed text on outside click. Long strokes remain responsive and use simplified point storage.

## Phase 3 — Diagramming

**Goal:** Make system and process diagrams a first-class Draftspace workflow.

- Explicit connector bindings and anchor previews
- Straight, elbow, and curved connectors
- Arrowheads, labels, and control points
- Connection updates during shape movement
- Alignment and distribution
- Grouping, locking, and layer controls
- Edge, center, anchor, and equal-spacing snapping

**Acceptance:** Connected objects remain attached through move, resize, undo, redo, duplicate, copy, and paste. Pasted connected groups never bind back to originals.

## Phase 4 — Portability and board management

**Goal:** Let users confidently manage and share local work.

- Draftspace JSON import/export with migrations
- PNG and SVG export
- Selection and full-board export options
- Recent-board browser
- Create, rename, duplicate, and delete board flows
- Keyboard-shortcut reference
- Accessible board summary

**Acceptance:** Invalid imports cannot crash or overwrite the current board. Export bounds, background, padding, scale, and transparency behave consistently.

## Future platform work

Authentication, cloud sync, collaboration, comments, public links, templates, mobile editing, image uploads, presentation mode, and AI-assisted diagramming remain postponed until the manual local canvas is dependable and portable.
