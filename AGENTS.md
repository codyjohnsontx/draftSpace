# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Full validation: `npm run typecheck && npm run lint && npm test && npm run build`, then `CI=1 npm run test:e2e` (CI=1 serializes workers; without it the WebGL-heavy landing/space specs starve each other and fail spuriously - see the comment in `playwright.config.ts`), `npm run test:performance`, `npm run test:collaboration`, and `npm run collaboration:test` for the worker. E2e and performance boot `next start`, so `npm run build` must run first; override ports with `PLAYWRIGHT_PORT` when 3107/3108 are taken.
- Driving the canvas with synthetic events (outside Playwright): the workspace commits each gesture to React state on `pointerdown`, so a same-tick down/move/up silently no-ops. Space `PointerEvent`s across ticks (a `requestAnimationFrame` or two between dispatches). Real CDP input does not have this problem.
- Asserting in e2e that a gesture changed *nothing* in the stored board: the board reaches IndexedDB through the autosave coordinator's 500ms debounce (`src/features/persistence/autosave-coordinator.ts`), so an immediate read, or `expect.poll` for the unchanged value, passes before a wrong write could have landed. Wait past the debounce first. Note `data-element-count` is `board.elementIds.length` only, so it can never speak for connectors.
- Schema changes: a new field with a correct default costs no schema version - add it to the Zod schema with `.default(...)` and it parses on older stored documents (see "Schema evolution" in `docs/architecture.md`). Bump the version only for changes older documents cannot default their way through, such as new element types.

## Code review convention

Reviews run once per pull request, not once per push. `.coderabbit.yaml` sets
`auto_incremental_review: false`; ask for a re-review with `@coderabbitai review`
when the branch is genuinely ready.

Open pull requests as drafts and work there. Draft pull requests are not reviewed,
so the pipeline's own fix commits cost nothing, and the author marks it ready when
the branch is finished.

## Invariants worth knowing before you edit

**One tab owns a board.** Only the tab holding the board's Web Locks claim may edit or save it; every other tab on the same board is read-only, except a tab that cannot write to storage at all, which holds no claim and keeps editing its in-memory draft precisely because a tab that cannot write cannot overwrite anyone. Holding the claim makes a write exclusive, not current, so a write path that cannot reload first must check that the stored record has not moved on. Two things follow. Any new control that mutates the document must gate on `useCanEditBoard()` / `canEditBoard()` (`src/hooks/use-can-edit-board.ts`) rather than reading the collaboration store directly, and `dispatchCommand` enforces the same rule for local commands as a backstop. Any new write path must run only when the tab owns the board, and anything that changes which board is open must hand the claim over with it. See "One tab owns a board" in `docs/architecture.md` for the design and the alternatives that were rejected.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
