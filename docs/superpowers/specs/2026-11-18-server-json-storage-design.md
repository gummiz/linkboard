# Server-side JSON storage

## Intent

Linkboard keeps every board in the browser's `localStorage` (`src/storage.ts`). That has three costs the owner of this fork ran into:

- A second browser on the same machine shows an empty app. Firefox and Chrome never see each other's boards.
- There is no file to back up. A cleared browser profile loses everything.
- A future browser extension ("save this page to a board") has no way in, because an extension cannot write another site's `localStorage`.

The fix is a small Node server inside the existing Docker container. It serves the built app as nginx does today and keeps the app state in one JSON file on a mounted volume. Every browser reads and writes that file through a tiny API.

## Goals

- One source of truth (`data/linkboard.json` on the host) shared by every browser on this machine.
- The file is plain, readable JSON that can be copied, versioned or restored by hand.
- Existing `localStorage` boards move into the file without manual export/import.
- `docker compose up -d --build` stays the only command to run the app.

## Non-goals

- The browser extension itself (separate repo, later). The `POST /api/links` endpoint it needs is noted under Future work, not built here.
- Live sync between open tabs (no WebSockets / Server-Sent Events).
- Accounts, authentication, multiple users.
- A "find duplicate links" feature. Useful, but separate; it is listed under Future work.

## Anti-goals

- Linkboard must not stop working without the server. `npm run dev`, `vite preview` and any static hosting keep today's `localStorage` behavior. Upstream describes the app as running entirely in the browser; a server must stay an optional add-on.
- A save must never silently discard changes made in another tab or browser.
- A crash or full disk must never leave a half-written data file.
- No new runtime dependencies (no Express, no database). `node:http` and `node:fs` are enough for static files plus two endpoints.

## Constraints

- The server binds to this machine only. `compose.yaml` publishes the port as `127.0.0.1:5173:<port>`. With no authentication, LAN exposure would let anyone on the network read and change the boards.
- The data format stays `AppState` (`{ version: 1, boards, activeBoardId }`) and is validated by the existing `parseState` on both sides.
- Node 22 in the container (the build stage already uses `node:22-alpine`).

## Approaches

| Approach | Trade-off | Decision |
|---|---|---|
| **A. Whole state as one document**: `GET /api/state`, `PUT /api/state` with a version check | Sends the full state on every save (a few hundred KB at most, on localhost). Keeps the reducer as the only place that knows how boards change. | **Chosen** |
| B. Fine-grained REST (`/boards/:id/categories/:id/items`) | Duplicates the reducer's logic on the server; two places to keep in sync. Pays off only with many users or very large data. | Rejected |
| C. Browser stays primary, server only mirrors a backup | Least work, but Firefox would still start empty. Does not solve the main problem. | Rejected |

## Design

### API

```
GET /api/state
  200 { revision: number, state: AppState | null }   # null while the file does not exist yet

PUT /api/state
  body { baseRevision: number, state: AppState }
  200 { revision: number }                            # saved, revision incremented
  409 { revision: number, state: AppState }           # baseRevision is stale; current file returned
  400                                                 # body fails parseState
```

`revision` is a server-side counter stored in the file next to the state (`{ revision, state }`). It is unrelated to `AppState.version`, which stays the schema version.

Any other `/api/*` path returns 404. Every other path serves the built app from `dist/`, falling back to `index.html`.

### Writing the file

The server writes to a temp file in the same directory and renames it over `linkboard.json`. Rename is atomic on one filesystem, so a reader or a crash only ever sees the old or the new file. The server handles one PUT at a time (an in-process queue or a simple lock), which makes the revision check race-free.

The data directory comes from an environment variable (e.g. `LINKBOARD_DATA_DIR=/data`), mounted in `compose.yaml` as `./data:/data`. `data/` goes into `.gitignore`.

### Client: choosing the storage mode

On startup the app calls `GET /api/state`.

- **Request fails or returns non-JSON** (dev server, static hosting): server mode is off. Behavior is exactly today's.
- **Request succeeds**: server mode is on. The file is the source of truth. `localStorage` keeps receiving a copy of every save, as an offline fallback.

While the check runs, the app shows its normal loading state; it must not flash the sample board and then replace it.

### Client: first contact between browser and file

"Browser data" means a real `localStorage` entry. The sample board shown on a fresh browser (`sampleState()`) is not data and never triggers the dialog.

| File | Browser | Result |
|---|---|---|
| empty | none | Start with the sample board, save it to the file. |
| empty | has data | Upload browser data to the file automatically (the migration). |
| has data | none, or identical | Use the file. |
| has data | differs | Show the conflict dialog. |

"Identical" compares the serialized boards (ignoring `activeBoardId`).

### Conflict dialog

```
┌ Your browser's boards differ from the saved file ──────────┐
│ Browser: 3 boards, 84 links · File: 5 boards, 210 links    │
│                                                            │
│ [Download browser boards as backup]                        │
│                                                            │
│ [Use the file]                 [Merge into the file]       │
└────────────────────────────────────────────────────────────┘
```

- **Download browser boards as backup**: saves the browser state as the existing full JSON backup. Optional, stays available until the user picks one of the other two buttons.
- **Use the file**: load the file, overwrite `localStorage` with it.
- **Merge into the file**: run the merge below, save the result, then report e.g. "Merged: 12 links added, 30 already present."

The dialog is a modal (`<dialog>`), keyboard-accessible, and blocks the board until resolved, so no edits happen on an undecided state.

### Merge rule

The file is the base; the browser only adds what is missing.

1. Boards are matched by name (trimmed, case-insensitive). A browser board with no match is appended.
2. Within a matched board, categories are matched the same way. Unmatched categories are appended.
3. Links are matched by `normalizeUrl(url)` across the **whole file**, not just the same category. A browser link whose URL already exists anywhere in the file is skipped, and the file's copy stays where it is. Otherwise the link is added to its browser board/category.
4. Click counts and notes of skipped links are not merged.

The merge is a pure function (`mergeStates(file, browser) → { state, added, skipped }`) with unit tests. It never creates a duplicate URL.

### Saving and staleness

- After each state change, the client saves with a short debounce (~300 ms), sending the last known `revision` as `baseRevision`.
- The client keeps the reducer actions dispatched since the last successful save. On **409**, it takes the returned file state, replays those actions on it, and saves again. If that is not possible, it loads the file state and shows a notice: "Reloaded changes from another window; your last edit was not saved."
- When the tab regains focus (`visibilitychange` → visible, or `focus`), the client fetches `GET /api/state` and adopts it if the revision is newer and nothing is pending.
- `activeBoardId` is per browser. The file stores one, but a browser that already has a valid active board keeps it when adopting a newer file state, so switching boards in Chrome does not switch Firefox. (Builder-check call.)
- When a save fails for network reasons, the notice area says so ("Not saved: server unreachable"), and the change stays in `localStorage`. No silent fallback.

### Docker

- The runtime stage changes from `nginx:1.27-alpine` to `node:22-alpine` running the server. nginx is removed.
- `compose.yaml`: port bound to `127.0.0.1`, volume `./data:/data`, `restart: unless-stopped` kept.
- README: "Run with Docker" describes the data file, where it lives, and how to back it up. The sentence about `localStorage` being tied to the port is updated.

### Tests

- Unit (Vitest): `mergeStates` cases (new board, matched board, URL present in another board, case/whitespace in names); the first-contact table above.
- Server: a test that starts the server on a temp directory and checks GET on missing file, PUT/GET round trip, 409 on stale revision, 400 on invalid state, and that the file stays valid if a write is interrupted.
- E2E (`e2e/app.e2e.mjs`): against the container or a locally started server, add a link in one browser context and see it in a second context after focus.

## Decided in conversation

- Server optional; without it the app behaves as today.
- Conflict handling: dialog with optional backup download, "Use the file" and "Merge"; merge rule as above. Duplicate finder is a separate, later feature.
- Multiple open tabs: reload on focus plus revision check; no live sync.
- Reachable from this machine only.
- Approach A (whole state document).

## Left to the builder

- How the server code shares `parseState` with the client (e.g. bundling the server with Vite/esbuild in the build stage, or running TypeScript in Node). Note: `src/storage.ts` imports `./model` without an extension, which Node's type stripping does not resolve on its own.
- Exact module layout of the server and of the client sync code.
- The loading-state markup during the initial `GET`.

## Future work

- `POST /api/links { url, name, board?, category? }` for the browser extension.
- "Find duplicate links" across all boards.
- Optional LAN access with a token, if a second device is ever wanted.
