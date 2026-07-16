# Draftspace

Draftspace is a local-first infinite canvas where rough ideas become clear. Phase 1 establishes the dependable interaction loop: pan, pointer-centered zoom, rectangle creation, selection, movement, resizing, clipboard actions, undo/redo, and IndexedDB persistence.

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
```

The architecture decisions are recorded in [`docs/architecture.md`](docs/architecture.md).
