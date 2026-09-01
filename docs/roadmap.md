# Draftspace Product Roadmap

This roadmap favors interaction trust over feature count. Draftspace should earn confidence as a thinking surface before it expands into a broad diagramming suite.

## Assumptions and product challenges

- **Reliability is the first retention feature.** Users will not adopt more drawing tools if a canceled gesture, reload, or save can change their work unexpectedly.
- **Desktop pointer workflows are the first quality bar.** Touch editing remains out of scope until mouse and trackpad behavior are dependable.
- **Local-first is a real product promise.** Recovery, portability, and explicit save state matter more than account or sharing features in the near term.
- **1,000 ordinary elements is the initial performance target.** Optimization work must be driven by repeatable measurements, not speculative infrastructure.
- **Connectors are the first major differentiator.** They begin only after transformations, styling, and history share stable geometry contracts, which Phase 2.1 settled. Text editing is not one of those contracts, so connectors landed ahead of Phase 2.2.

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

## Phase 1.2A — Save lifecycle and recovery

**Goal:** Make local work recoverable under validation and storage failures.

- Lifecycle-aware save flushing
- Bounded automatic retries and manual retry controls
- Corrupt-data recovery without overwriting raw records
- Session-only mode when IndexedDB is unavailable
- Emergency board and raw recovery downloads
- Clear online, offline, saving, failed, and temporary states

**Acceptance:** Failed saves preserve in-memory work and can be retried. Corrupt records remain untouched and downloadable. The canvas remains usable with a clear warning when durable storage is unavailable.

## Phase 1.2B — Performance and browser resilience

**Goal:** Prove that Draftspace remains responsive on large boards and dependable across supported browsers.

- [x] Browser capability detection, soft fallbacks, and a blocking Canvas 2D screen
- [x] Deterministic 100/500/1,000-element all-visible and distributed benchmark fixtures
- [x] Render, hit-test, marquee, interaction-latency, save, and load instrumentation
- [x] Chromium, Firefox, and WebKit critical smoke coverage
- [x] Chromium performance safety caps and JSON reports
- [x] GitHub Actions quality, browser-smoke, and performance jobs

**Acceptance:** The 1,000-element fixture remains usable and reports benchmark data. Missing non-storage browser capabilities fail with actionable fallbacks, and supported evergreen browsers pass smoke coverage.

## Phase 2.1A — Shape foundation

**Goal:** Add the first diagramming shapes without weakening the trusted rectangle workflow.

- [x] Ellipse and diamond tools with direct toolbar buttons and E/D shortcuts
- [x] Shared shape creation, rendering, transformation, history, clipboard, and persistence contracts
- [x] Shape-silhouette point selection with full-bounds marquee containment
- [x] Schema-version-2 documents and validated version-1 rectangle-board migration

**Acceptance:** Ellipses and diamonds use the same modifiers, one-shot creation flow, selection controls, history, clipboard, persistence, and recovery behavior as rectangles. Existing version-1 rectangle boards migrate without data loss.

## Phase 2.1B — Styling and lines

**Goal:** Expand visual vocabulary without weakening the interaction model.

- [x] Contextual inspector with floating, right-sidebar, and hidden layouts
- [x] App-level inspector layout preference with narrow-screen overlay behavior
- [x] Stroke, fill, width, style, opacity, and rectangle corner-radius controls
- [x] Curated, custom, and recent colors with mixed-selection behavior
- [x] Live session previews that commit one history entry per completed edit
- [ ] Straight lines
- [ ] Rotation

**Acceptance:** Lines and every styling change use the same selection, transformation, history, clipboard, persistence, and export contracts as existing shapes.

**Follow-up:** Add reusable recent-shape presets so a user can create a copy of a previous shape’s type, dimensions, and style with one action. Define preset persistence, retention, naming, and placement behavior as a separate slice.

## Phase 2.1C — Temporary live rooms

**Goal:** Let a local-first user briefly invite trusted guests into the current board without turning Draftspace into an account-first cloud product.

- [x] Host-created 10-character room codes and approval lobby
- [x] Viewer/editor roles, removal, and a four-person room cap
- [x] Live cursors, selections, active tools, and optional follow-host viewport
- [x] Host-authoritative typed commands, revisions, validation, and snapshot recovery
- [x] Personal conditional undo that preserves later edits from other participants
- [x] Guest reconnect tokens and a 60-second read-only host grace period
- [x] Ephemeral Cloudflare Durable Object relay with no persisted board content
- [x] Chromium, Firefox, and WebKit host/guest smoke coverage

**Acceptance:** A host can approve up to three guests, change their roles, and end the room. Admitted editors see accepted edits live; viewers cannot mutate the board. Presence never enters board history or persistence. Host loss makes guests read-only and either recovers from a fresh snapshot or ends the room after 60 seconds. The host's local IndexedDB document remains the only durable board copy.

**Availability gate:** The implementation is enabled in development and cross-browser CI, but production exposure remains behind `NEXT_PUBLIC_COLLABORATION_ENABLED=1` until straight lines and rotation complete Phase 2.1B.

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

**Delivered ahead of Phase 2.2.** Connectors needed only the geometry, styling, and history contracts Phase 2.1 settled, so the checked items below shipped before text, notes, and freehand start. Phase 2.2 keeps its place in the sequence and is still ahead of the unchecked work here.

- [x] Connector tool with a direct toolbar button and C shortcut, explicit bindings, and anchor previews
- [x] Connector selection and deletion
- [x] Connector styling: color, width, kind, and label
- [x] Arrowheads at either end, both, or neither *(a defaulted field; no schema version)*
- [x] Connection updates during shape movement
- Straight, elbow, and curved connectors
- Connector control points
- Alignment and distribution
- Grouping, locking, and layer controls
- Edge, center, anchor, and equal-spacing snapping

**Acceptance:** Connected objects remain attached through move, resize, undo, redo, duplicate, copy, and paste. Pasted connected groups never bind back to originals.

**Binding an edge:** A connector is drawn by dragging from one object to another with the connector tool. It is stored as two bindings - an element and a port - rather than as two points, so it is a statement about what is joined rather than about where the line happens to run: moving or resizing either end re-routes the edge with no edit to the connector at all, and deleting an end takes the edge with it. A drag that leaves or lands on an anchor pins that end to that side; anywhere else on the object binds "auto", which resolves to whichever pair of ports face each other at the time. So a user chooses between "always leave from the right" and "leave from whichever side is facing" by where the drag starts, with no mode to set. The edge is previewed by the same routing function that draws the committed one, so an edge lands exactly where the drag showed it, and it commits on release as one history entry.

**Anchor previews:** The four anchors of whatever the pointer is over are shown while the connector tool is active, with the one a press would take filled. During a drag both ends show theirs, so the pinned side and the side being aimed at are both visible. Because those points are exactly where the selection frame's resize handles are, the connector tool puts the frame away: the two would otherwise be drawn on top of each other, and a press near a corner would resize the shape rather than wire it.

**What may be an end:** Locked and hidden objects are left alone, as they are by selection. An edge cannot end where it began, and wiring one pair the same way twice is a no-op rather than an invisible duplicate stacked on the first. The connector stays armed after a drag: a diagram is many edges, and a committed edge is not selected either, since a halo over the edge you are still wiring from is noise.

**Choosing an edge:** An edge is taken by clicking the line it draws, measured against the routed polyline itself rather than the box its elbows sweep out - so the empty space an elbow turns around belongs to whatever is under it, and an edge is grabbed with the same screen tolerance a shape's outline is, widened to no less than half its own width so a thick edge is never harder to hit than the ink it puts down. Every element is drawn over every edge, so an edge is only taken where nothing else was; among edges the topmost wins. A locked edge is left alone, as a locked element is, and an edge whose ends are gone or hidden draws nothing, so there is nothing to take. Taking one starts no gesture: an edge is bound to its ends rather than placed, so there is nothing to drag.

**A selection of one kind:** The selection holds elements or edges, never both. An edge cannot be moved, duplicated, copied, nudged, or styled the way an element is, so a mixed selection would make every one of those mean "do this to the part of the selection it applies to" - the ambiguity the rest of the app avoids. Taking one kind therefore drops the other, which also keeps Delete unambiguous: it takes the edges when edges are held and the elements otherwise. Deleting an edge leaves both objects it joined standing, and it is one history entry that an undo puts back whole - the reverse of deleting an object, which already takes its edges with it. Selecting a shape does not select the edges attached to it, because those already come and go with it.

**Showing a taken edge:** A selected edge wears a halo the width of its own ink plus a screen margin, drawn on the same routed polyline the canvas draws so the two can never disagree. It is a highlighter mark rather than a frame: a box around an edge's elbows would claim area the edge does not occupy. The halo cuts the corridor of the edge's own ink out of itself with a mask, so it flanks the line rather than washing over it. A solid translucent band centered on the route would draw a selected edge in a blend of its color and the accent - a teal edge would read olive, and the color control would be reporting a color the canvas was not showing. The masked band leaves the ink and the arrowhead exactly as the canvas drew them.

**Styling an edge:** With edges held, the inspector shows the controls an edge has rather than the element ones with most of them hidden: a stroke color, a width, the arrowheads, and the kind. An edge has no interior to fill and no box to round, so those groups are not shown at all. The kind is the one control that is not purely visual: sync, async, and data are what the edge *means*, and the dash pattern follows from the kind rather than being set beside it, so an edge cannot say one thing and look like another. A color being tried out through the eyedropper is drawn before it is committed, the same way a shape's is, which is why the canvas takes the edges it draws as an argument rather than reading them from the document.

**Naming an edge:** An edge is named in the inspector rather than on the canvas, because it has no box to put a caret in and its middle moves whenever either end does. The field is offered only when exactly one edge is held, the way a board's name is: a name belongs to one edge. It commits on blur and on Enter as its own history entry - naming is not restyling - Escape puts the stored name back, and clearing the field leaves the edge with no name at all rather than an empty one. The name is drawn half way along the routed edge by length and set off the line: above a horizontal run, beside a vertical one. A vertex would have been the wrong place - a two-point route's middle vertex is its arrowhead, so a name drawn there sits on the arrow and is clipped by the object it points at.

**Which ends an edge points at:** An edge carries which of its two ends wear a head - neither, the one it was dragged to, the one it was dragged from, or both. The choice names the ends of the binding rather than a direction on screen, so "the source end" stays the source however the two objects are later moved past each other, the same way a pinned port stays the side it was pinned to. A head is aimed along the route's own run into that end rather than along the line between the two objects, so it meets an elbow square on. This is what makes an undirected association, a two-way dependency, and a call-and-response all sayable with the same edge. Like every other edge style it applies to every held edge as one history entry. The field defaults to the destination head every edge was drawn with, so it cost no schema version: a stored edge that predates the choice is read exactly as it always looked.

**How large a head is drawn:** A head grows with the ink it caps rather than being one fixed size, because the width control offers edges four times the default's - a wide edge would otherwise end in a barb narrower than its own line, which reads as the line simply stopping. The default 2-unit edge keeps the exact size every arrowhead in the app has always been drawn at, so no existing diagram changes.

**An edge while its ends are being dragged:** A move or a resize draws its elements at boxes that are not yet on the board, and an edge is routed against whichever box its ends are being *drawn* at rather than against the stored one. So a connector leaves the shape's own side the whole way through a drag - re-resolving a facing port the moment the two objects pass each other, and coming in as a shape is pulled narrower - instead of staying pinned to where the shape used to be and snapping across on release. The gesture hands on only the elements it is holding, keyed by id, so an edge bound to something nothing is dragging costs a single failed lookup and the board is never walked; with no gesture in flight there is no preview at all and routing reads the document, exactly as it did. This is what makes the acceptance rule ("connected objects remain attached through move, resize, undo, redo") true of the frames as well as of the result: what the drag showed is what the release stored, which is the same rule the shape preview itself already follows.

**Follow-up:** A new edge is drawn as an elbow pointing at what it was dragged to, and the heads are chosen after the fact. Choosing them before drawing needs a tool-options surface, worth building once for every tool rather than putting more pickers in the tool rail.

**Follow-up:** Control points are still owed: an edge's path is entirely derived from its two bindings, so a user cannot pull a bend where they want one. That wants a stored per-edge waypoint list, which makes the route partly authored rather than wholly computed, so it belongs with the snapping work that will decide what a dragged bend snaps to.

**Follow-up:** Marquee selection still takes only elements; whether dragging a box over a diagram should pick up the edges inside it is a question worth answering with the alignment and grouping work rather than before it. An edge's `locked` flag still has no control - a locked edge cannot be chosen, so the inspector cannot be where it is unlocked either.

## Phase 4 — Portability and board management

**Goal:** Let users confidently manage and share local work.

**Delivered ahead of the phase.** Reaching a second board could not wait for the rest of board management: until the switcher below, a browser holding more than one board could reach only the last-opened one, and every other board it held was stranded. It shipped on the repository listing that already existed and does nothing but open and switch. Everything else here keeps its place in the sequence.

- Draftspace JSON import/export with migrations
- PNG and SVG export
- Selection and full-board export options
- [x] Board switcher over the stored boards *(opening and switching only)*
- Recent-board browser
- Create, rename, duplicate, and delete board flows
- Keyboard-shortcut reference
- Accessible board summary

**Acceptance:** Invalid imports cannot crash or overwrite the current board. Export bounds, background, padding, scale, and transparency behave consistently.

## Future platform work

Authentication, durable cloud sync, asynchronous sharing, comments, public links, templates, mobile editing, image uploads, presentation mode, and AI-assisted diagramming remain postponed. Temporary host-led live rooms are intentionally narrower: they require an active host and do not create a cloud board copy.
