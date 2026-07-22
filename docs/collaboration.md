# Draftspace live collaboration

## Product boundary

Live rooms are a temporary extension of Draftspace's local-first board, not cloud storage. The host opens a room, shares a 10-character code or invite URL, and explicitly admits each guest as a viewer or editor. A room supports the host plus three guests. No account is required; a display name and participant color are stored only as a small local browser preference.

The host must remain available. When its connection drops, guests immediately become read-only for a 60-second grace period. A returning host refreshes guests from the authoritative board. If the grace period expires, the room ends. Ending or leaving a room does not modify a participant's unrelated local boards.

## Data flow

1. The browser creates a room through `POST /rooms` and receives a Crockford-style code plus a 256-bit host token.
2. Host and guest browsers connect to the room's Durable Object over WebSocket and send protocol-versioned messages.
3. New guests wait in a host-controlled lobby. Admission creates a hashed reconnect token and a viewer or editor role.
4. An editor applies a typed board command locally and sends one proposal at a time with its last acknowledged room revision.
5. The host validates the command, board ID, and base revision, applies it to the local board, and accepts it through the relay.
6. The relay increments the room revision and broadcasts the accepted command. A stale or rejected editor requests a complete validated host snapshot.

Commands cover element creation, deletion, field updates, and board metadata/preferences. Viewport position is personal and excluded. Presence messages carry cursor position, selection IDs/count, active tool, and an optional presenting viewport; they never enter history or IndexedDB.

## Persistence and security

- The host's normal IndexedDB repository remains the only durable board store.
- Guests keep the shared board in memory and do not add it to their local board history.
- Durable Object storage contains room metadata only: room ID, hashed tokens, roles, revision, and disconnect timing.
- The worker never writes board snapshots, commands, cursor data, or display names to Durable Object storage. Display names remain only on active WebSocket connection attachments for room delivery.
- WebSocket and REST requests require an exact configured origin.
- Client and server envelopes are validated, guest actor IDs are bound to their authenticated connection, messages are capped at 5 MiB, and burst traffic is bounded.
- Room tokens are bearer secrets. Room codes are invitations, not authentication; host approval remains required.

This is suitable for a host-led design review or interview walkthrough. It is not a substitute for authenticated durable collaboration, access logs, organizational policy, or end-to-end encryption.

## Local development

Run the app and relay in separate terminals:

```bash
npm run dev
npm run collaboration:dev
```

The local defaults are `http://127.0.0.1:3000` for Draftspace and `http://127.0.0.1:8787` for the worker. Override the browser endpoints when needed:

```text
NEXT_PUBLIC_COLLABORATION_HTTP_URL=https://your-worker.example
NEXT_PUBLIC_COLLABORATION_WS_URL=wss://your-worker.example
NEXT_PUBLIC_COLLABORATION_ENABLED=1
```

Development builds enable collaboration automatically. Production builds require the explicit flag above so the room entry point stays private until Phase 2.1B lines and rotation are complete. Update `ALLOWED_ORIGINS` in `workers/collaboration/wrangler.jsonc` for deployed Vercel origins. Deploy the worker with an authenticated Wrangler session only after reviewing the production origin and environment configuration; this repository does not deploy it automatically.

## Verification

```bash
npm run collaboration:typecheck
npm run collaboration:test
npm run build
npm run test:collaboration
```

The worker tests cover ephemeral metadata, origin rejection, lobby admission, editor command relay, and revision broadcast. The Playwright suite runs the complete host/guest workflow in current Chromium, Firefox, and WebKit, including presence, editor-to-viewer changes, personal undo, and room termination.
