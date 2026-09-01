# Draftspace

Draftspace is a local-first infinite canvas where rough ideas become clear. Its dependable interaction loop supports pan, pointer-centered zoom, rectangle, ellipse, and diamond creation, connectors that stay bound to the shapes they join, selection, movement, resizing, clipboard actions, undo/redo, and IndexedDB persistence. A browser that holds more than one board can reopen any of them from the board name, and the board picked is the one the next load opens. In browsers that support the Web Locks API, a board is edited by one tab at a time: opening the same board in a second tab shows it as a read-only view that says why, and that tab takes over on its own once the editing tab closes. A host can also open a temporary, approval-based live room for cursors, shared edits, and walkthroughs without uploading a durable board copy.

## Development

```bash
npm install
npm run dev
```

Open the local URL shown by Next.js.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run collaboration:typecheck
npm run collaboration:test
npm run test:collaboration
```

The architecture decisions are recorded in [`docs/architecture.md`](docs/architecture.md), with live-room setup and trust boundaries in [`docs/collaboration.md`](docs/collaboration.md).
