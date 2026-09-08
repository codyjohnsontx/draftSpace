# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Full validation: `npm run typecheck && npm run lint && npm test && npm run build`, then `CI=1 npm run test:e2e` (CI=1 serializes workers; without it the WebGL-heavy landing/space specs starve each other and fail spuriously - see the comment in `playwright.config.ts`), `npm run test:performance`, `npm run test:collaboration`, and `npm run collaboration:test` for the worker. E2e and performance boot `next start`, so `npm run build` must run first; override ports with `PLAYWRIGHT_PORT` when 3107/3108 are taken.
- Driving the canvas with synthetic events (outside Playwright): the workspace commits each gesture to React state on `pointerdown`, so a same-tick down/move/up silently no-ops. Space `PointerEvent`s across ticks (a `requestAnimationFrame` or two between dispatches). Real CDP input does not have this problem.
- Asserting in e2e that a gesture changed *nothing* in the stored board: the board reaches IndexedDB through the autosave coordinator's 500ms debounce (`src/features/persistence/autosave-coordinator.ts`), so an immediate read, or `expect.poll` for the unchanged value, passes before a wrong write could have landed. Wait past the debounce first. Note `data-element-count` is `board.elementIds.length` only, so it can never speak for connectors.
- Unit-testing `collaboration-controller.ts`: importing it constructs the app's own controller against a real WebSocket transport, subscribed to the same stores a test drives, so two controllers race over one store. Dispose the exported `collaborationController` once, then drive your own instance built on a fake `CollaborationTransport`.
- Styling the app shell: `src/app/globals.css` opens with the token layer - colour ramps, radii, weights, type scale, spacing, elevation and z-order - and nothing below that block carries a hex literal, a raw radius, a raw weight or a raw padding. Add a token rather than a literal; `sed -n '/^}/,$p' src/app/globals.css | grep -oE '#[0-9a-fA-F]{3,8}'` should stay empty. The landing page keeps its `.landing-*` scoping and draws on the same tokens, with two it restates on `.landing-root` and must go on restating: `--shadow`, because the shell's elevation ramp carries an inset white highlight that reads as a hard line across a saturated button, and `--surface`, because the shell thinned it for its backdrop blur and the landing page's buttons sit over a moving WebGL scene. Deleting either override is a visible regression on the landing page alone, which no app-shell screenshot shows.
- The floating style bar has a width budget: no control it draws may leave the bar or the window, from 1440px down to 360px, for every branch of `selectionLabel` - one shape, mixed shapes, one connector, several connectors - measured by `tests/e2e/style-inspector.spec.ts`. What buys that is a header that shrinks and groups that all wrap or shrink; a fixed width or a `min-width` floor anywhere in the bar is a floor on every control to its right, which is how the palette button and then the connector arrows each escaped once. Check that test rather than the bar by eye, and note that the bar's own box proves nothing, since `width: max-content` under a `max-width` stays on screen however far its contents run past it. Only the floating shape is compact: the sidebar shows every colour inline.
- Schema changes: a new field with a correct default costs no schema version - add it to the Zod schema with `.default(...)` and it parses on older stored documents (see "Schema evolution" in `docs/architecture.md`). Bump the version only for changes older documents cannot default their way through, such as new element types.

## Code review convention

Reviews run once per pull request, not once per push. `.coderabbit.yaml` sets
`auto_incremental_review: false`; ask for a re-review with `@coderabbitai review`
when the branch is genuinely ready.

Open pull requests as drafts and work there. Draft pull requests are not reviewed,
so the pipeline's own fix commits cost nothing, and the author marks it ready when
the branch is finished.

## Invariants worth knowing before you edit

**One tab owns a board.** Only the tab holding the board's claim may edit or save it; every other tab on the same board is read-only. Two deliberate exceptions read as bugs and are not: without Web Locks the claim cannot be enforced, so each tab claims outright rather than being stranded read-only, and a tab that cannot write to storage at all stays editable, because a tab that cannot write cannot overwrite anyone.

Five rules bind new code:

- Edit rights are never wider than the claim actually held, mid-transition included. Work resuming after an `await` proves it still holds its lease with `boardClaimIsCurrent`, never with the board id.
- Any control that mutates the document gates on `useCanEditBoard()` / `canEditBoard()` (`src/hooks/use-can-edit-board.ts`) rather than reading the collaboration store; `dispatchCommand` is the backstop, not the gate.
- Any write path runs only when the tab owns the board, and anything that changes which board is open hands the claim over with it.
- Offering the board to other people is a write path too, and one that stays open: hosting a live room needs the claim when the room is created, when a stored host session is restored, and for as long as the room runs (`src/features/collaboration/collaboration-controller.ts`). A tab that hosts without the claim saves nothing, so its guests' work is discarded when the room closes.
- Holding the claim makes a write exclusive, not current, so `storedStamp` is the second precondition. It answers two questions - has the stored record moved on, and is a tab with no coordinator left holding work nothing will write - so every writer refreshes it and every path that puts a stored board on screen records it (`src/features/persistence/stored-board-stamp.ts`). Its currency is the document's `stateId`, replaced by every mutation, never `updatedAt`: a millisecond timestamp collides across two mutations in one tick, and the switch then discards unsaved work silently.

Design and the alternatives rejected: "One tab owns a board" in `docs/architecture.md`. What these rules actually produce is pinned by `tests/e2e/tab-ownership.spec.ts`, `tests/integration/board-switching.test.ts`, and `tests/unit/collaboration-host-ownership.test.ts`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
