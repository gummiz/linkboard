# Server-side JSON Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional Node server in the Docker container that stores the app state in one JSON file shared by every browser on this machine; without the server the app behaves exactly as today.

**Architecture:** `node:http` server (TypeScript, bundled by `vite build --ssr` into `dist-server/server.js`) serves `dist/` and two endpoints `GET/PUT /api/state` with a revision check and atomic file writes. The client probes `GET /api/state` before the first render, resolves first contact (auto-migrate / conflict dialog), then saves the whole state debounced and replays pending actions on 409.

**Tech Stack:** React 19, TypeScript, Vite 7, Vitest 3, Node 22, `node:http`, `node:fs/promises`, playwright-core (E2E).

**Spec:** `docs/superpowers/specs/2026-11-18-server-json-storage-design.md`

## Global Constraints

- No new runtime dependencies. Only addition: devDependency `@types/node` (types for `tsc`; nothing ships).
- Data format stays `AppState` (`{ version: 1, boards, activeBoardId }`), validated by `parseState` on client and server.
- File on disk: `{ revision: number, state: AppState }` at `$LINKBOARD_DATA_DIR/linkboard.json`.
- Server listens on `PORT` (default `8080`); compose publishes `127.0.0.1:5173:8080`. Never bind publicly in compose.
- Server mode off ⇒ behavior identical to today (`npm run dev`, `vite preview`, static hosting).
- Sample board (`sampleState()`) is never "browser data".
- Save debounce: 300 ms.
- User-facing copy (exact): `"Reloaded changes from another window; your last edit was not saved."`, `"Not saved: server unreachable"`, `"Merged: N links added, M already present."` (use the existing `plural` helper: `Merged: 12 links added, 30 already present.`).
- Node 22, ESM. Server source imports `../src/storage` (works because Vite bundles it).

## Review Focus

1. **Corrupt or hand-edited `linkboard.json`** (invalid JSON, wrong shape): server must answer `GET` with 500 and a clear log line, never overwrite the file with a fresh state. → Task 2 test `GET returns 500 and leaves a corrupt file untouched`.
2. **Two PUTs arriving at the same time with the same baseRevision**: exactly one 200, one 409. → Task 2 test `concurrent PUTs with same baseRevision: one wins`.
3. **Merged links reuse ids already in the file** (browser was once a copy of the file, then a URL was edited): merge must not create duplicate item/category/board ids. → Task 3 test `added entities get ids that do not collide`.
4. **Path traversal in static serving** (`/../package.json`, `/%2e%2e/`): must not leave `dist/`. → Task 2 test `does not serve files outside dist`.
5. **Browser `localStorage` is corrupt/unparseable** at first contact: treat as "no browser data", never show dialog or crash. → Task 4 test `unparseable browser data counts as none` (covered by `loadState()` returning null; test asserts `decideFirstContact(file, null)`).

---

## File Structure

| File | Responsibility |
|---|---|
| `server/stateFile.ts` | Read / atomically write `{ revision, state }` |
| `server/server.ts` | `createLinkboardServer()`: API + static files, PUT serialization |
| `server/main.ts` | Env parsing, `listen` |
| `server/server.test.ts` | Server integration tests (Vitest, node env) |
| `src/merge.ts` (+ `.test.ts`) | `mergeStates` pure function |
| `src/serverSync.ts` (+ `.test.ts`) | API client, `decideFirstContact`, `boardsEqual`, `replayPending`, `adoptState` |
| `src/bootstrap.ts` | Probe server before render → `InitialLoad` |
| `src/ConflictDialog.tsx` | Modal `<dialog>` |
| `src/useServerSave.ts` | Debounced save, 409 replay, focus refresh |
| `src/App.tsx`, `src/main.tsx` | Wiring |
| `e2e/sync.e2e.mjs` | Two-context E2E |
| `Dockerfile`, `compose.yaml`, `.gitignore`, `package.json`, `tsconfig.json`, `README.md` | Build / run |

---

### Task 1: Server build pipeline and state file module

**Files:**
- Create: `server/stateFile.ts`, `server/stateFile.test.ts`
- Modify: `package.json` (scripts, devDeps), `tsconfig.json` (`include` + `"types": ["vite/client", "node"]`), `.gitignore` (`data/`, `dist-server/`)

**Interfaces:**
- Produces:
  - `type StoredState = { revision: number; state: AppState }`
  - `readStateFile(dataDir: string): Promise<StoredState | null>`: null when the file does not exist; throws `Error("linkboard.json is not valid Linkboard data")` on bad JSON / failing `parseState` / non-integer revision.
  - `writeStateFile(dataDir: string, stored: StoredState): Promise<void>`: writes `linkboard.json.<random>.tmp` in `dataDir`, then `rename`. Pretty JSON (2 spaces), trailing newline.
- Scripts: `"build": "tsc --noEmit && vite build && vite build --ssr server/main.ts --outDir dist-server"`, `"start": "node dist-server/main.js"`, `"test:e2e:sync": "node e2e/sync.e2e.mjs"`.

- [ ] **Step 1:** `npm i -D @types/node@22`; update `tsconfig.json` (`include: ["src", "server", "vite.config.ts"]`), `.gitignore`.
- [ ] **Step 2: Write failing tests** in `server/stateFile.test.ts` (first line `// @vitest-environment node`, temp dir via `mkdtemp`):
  - `returns null when the file is missing`
  - `round-trips revision and state`: write `{ revision: 3, state: sampleState() }`, read equals it.
  - `throws on invalid JSON` and `throws on a shape parseState rejects`
  - `leaves no tmp file behind after a write`: `readdir` = `["linkboard.json"]`.
  - `a failed write keeps the old file`: write rev 1; then call `writeStateFile` with `dataDir` made read-only (`chmod 0o500`) → rejects; read still returns rev 1. (Restore mode in `finally`.)
- [ ] **Step 3:** Run `npx vitest run server/stateFile.test.ts` → FAIL (module missing).
- [ ] **Step 4:** Implement `server/stateFile.ts`.
- [ ] **Step 5:** Run tests → PASS. Run `npm run build` → `dist-server/main.js` missing is OK until Task 2; instead run `npm run typecheck` → PASS.
- [ ] **Step 6: Commit** `feat: add atomic JSON state file for server storage`

### Task 2: HTTP server

**Files:**
- Create: `server/server.ts`, `server/main.ts`, `server/server.test.ts`

**Interfaces:**
- Consumes: Task 1 `readStateFile`, `writeStateFile`, `StoredState`; `parseState` from `src/storage`.
- Produces: `createLinkboardServer(options: { dataDir: string; distDir: string }): http.Server` (not listening). `main.ts`: reads `LINKBOARD_DATA_DIR` (required; exit 1 with message if unset), `PORT` (default 8080), `DIST_DIR` (default `new URL("../dist", import.meta.url)` path), creates `dataDir` with `mkdir -p`, listens on `0.0.0.0` (container; compose restricts to localhost).

Behavior (from spec): `GET /api/state` → 200 `{ revision: 0, state: null }` if no file, else `{ revision, state }`; read error → 500 `{ error }`. `PUT /api/state` body `{ baseRevision, state }`: invalid JSON or `parseState` null or non-integer baseRevision → 400; `baseRevision !== current` → 409 `{ revision, state }`; else write `revision + 1` → 200 `{ revision }`. PUTs run one at a time through a promise chain (`let queue = Promise.resolve()`). Body limit 5 MB → 413. Other `/api/*` → 404. Static: resolve path inside `distDir`, reject if outside (404), missing file → `index.html`. Content-Type from a small extension map (`.html .js .css .svg .png .ico .json .webmanifest`, default `application/octet-stream`). `Cache-Control: no-cache` for `index.html`.

- [ ] **Step 1: Write failing tests** in `server/server.test.ts` (node env; temp `dataDir`, temp `distDir` containing `index.html` "<p>app</p>" and `assets/a.js`; server on port 0, use global `fetch`):
  - `GET on missing file returns revision 0 and null state`
  - `PUT then GET round-trips`: PUT `{ baseRevision: 0, state: sampleState() }` → 200 `{ revision: 1 }`; GET → `{ revision: 1, state }`.
  - `stale baseRevision returns 409 with current state`
  - `invalid state returns 400 and does not create the file`
  - `concurrent PUTs with same baseRevision: one wins` (`Promise.all` two PUTs; statuses sorted = `[200, 409]`).
  - `GET returns 500 and leaves a corrupt file untouched` (write `"{oops"`; after GET, file content still `"{oops"`).
  - `unknown /api path returns 404`
  - `serves dist files and falls back to index.html` (`/assets/a.js` → JS content-type; `/some/route` → index body).
  - `does not serve files outside dist` (`/../package.json` and `/%2e%2e/package.json` → not the package content).
- [ ] **Step 2:** Run `npx vitest run server/server.test.ts` → FAIL.
- [ ] **Step 3:** Implement `server/server.ts` and `server/main.ts`.
- [ ] **Step 4:** Run tests → PASS. `npm run build` → creates `dist-server/main.js`. Smoke: `LINKBOARD_DATA_DIR=$(mktemp -d) PORT=8099 npm start` then `curl -s localhost:8099/api/state` → `{"revision":0,"state":null}`.
- [ ] **Step 5: Commit** `feat: add node server with state API and static files`

### Task 3: `mergeStates`

**Files:**
- Create: `src/merge.ts`, `src/merge.test.ts`

**Interfaces:**
- Consumes: `normalizeUrl`, `newId`, types from `src/model`.
- Produces: `mergeStates(file: AppState, browser: AppState): { state: AppState; added: number; skipped: number }`. `state.activeBoardId = file.activeBoardId`.

Rules (spec "Merge rule"): file is base; boards then categories matched by `name.trim().toLowerCase()`; links matched by `normalizeUrl(url) ?? url` against a set of **all** file URLs, also updated as links are added (so two identical browser links add once). Unmatched boards/categories appended with the browser's items filtered by the same rule; an appended category/board that ends up with zero new links is still appended only if it had zero links in the browser too (empty structure is user data; a fully duplicate category is not). Every appended board, category and item gets `newId()`. `skipped` counts browser links not added.

- [ ] **Step 1: Write failing tests:**
  - `appends a board the file does not have` (added = its link count)
  - `merges into a board matched by name ignoring case and whitespace` (`" work "` ↔ `"Work"`; no second board)
  - `appends an unmatched category into a matched board`
  - `skips a link whose URL exists in another board of the file` (file copy stays, `skipped: 1`, total URL count unchanged)
  - `treats https://example.com and example.com/ as the same link`
  - `does not merge clicks or notes of skipped links`
  - `added entities get ids that do not collide` (browser items share ids with file items but differ in URL; collect all ids in result → all unique)
  - `never produces duplicate URLs` (browser has the same URL twice → added once)
- [ ] **Step 2:** `npx vitest run src/merge.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: add mergeStates for browser-into-file merge`

### Task 4: Client sync core (API client + pure decisions)

**Files:**
- Create: `src/serverSync.ts`, `src/serverSync.test.ts`

**Interfaces:**
- Consumes: `parseState`, `reducer`, `Action`, `AppState`.
- Produces:
  - `type ServerSnapshot = { revision: number; state: AppState | null }`
  - `fetchServerState(): Promise<ServerSnapshot | null>`: `GET /api/state`; returns null on network error, non-2xx, non-JSON or wrong shape (server mode off). Throws nothing.
  - `type SaveResult = { kind: "saved"; revision: number } | { kind: "conflict"; revision: number; state: AppState } | { kind: "unreachable" }`
  - `putServerState(baseRevision: number, state: AppState): Promise<SaveResult>`: 400/500 → throw `Error` (bug, fail loud).
  - `boardsEqual(a: AppState, b: AppState): boolean`: `JSON.stringify(a.boards) === JSON.stringify(b.boards)`.
  - `type FirstContact = { kind: "use-file"; state: AppState } | { kind: "upload"; state: AppState } | { kind: "conflict"; file: AppState; browser: AppState }`
  - `decideFirstContact(file: AppState | null, browser: AppState | null): FirstContact`: table from spec; file null + browser null → `upload` with `sampleState()`.
  - `replayPending(fileState: AppState, pending: readonly Action[]): AppState`: `pending.reduce(reducer, fileState)`.
  - `adoptState(incoming: AppState, localActiveBoardId: string): AppState`: keeps `localActiveBoardId` if a board with that id exists in `incoming`.

- [ ] **Step 1: Write failing tests** (mock `globalThis.fetch` with `vi.fn`):
  - `fetchServerState returns null when fetch rejects`, `…when response is HTML` (vite dev fallback: 200 `text/html`), `…returns snapshot on valid JSON`
  - `putServerState maps 200, 409, network error`; `throws on 400`
  - one test per first-contact row (4 rows) plus `file and browser identical except activeBoardId → use-file`, `unparseable browser data counts as none` (`decideFirstContact(fileState, null)` → use-file)
  - `replayPending applies item/add on top of a newer file state`
  - `adoptState keeps a valid local active board`, `…falls back to incoming when local board is gone`
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: add client API and sync decisions for server storage`

### Task 5: Bootstrap, conflict dialog, save loop, wiring

**Files:**
- Create: `src/bootstrap.ts`, `src/ConflictDialog.tsx`, `src/ConflictDialog.test.tsx`, `src/useServerSave.ts`
- Modify: `src/main.tsx`, `src/App.tsx`, `index.html` (static loading text inside `#root`), `src/styles.css` (dialog styles in existing tokens)

**Interfaces:**
- Consumes: Task 3 `mergeStates`; Task 4 everything; `loadState`, `saveState`.
- Produces:
  - `type InitialLoad = { mode: "local"; state: AppState } | { mode: "server"; revision: number; state: AppState; conflict?: { file: AppState; browser: AppState } }`
  - `loadInitialState(): Promise<InitialLoad>`: no server → `local` with `loadState() ?? sampleState()`. `upload` → PUT immediately (baseRevision = snapshot revision); on result `conflict` re-run with the returned state. `use-file` → `adoptState(file, browser?.activeBoardId)`.
  - `main.tsx`: `const initial = await loadInitialState(); render(<App initial={initial} />)`. `index.html` `#root` contains `<p class="boot-loading">Loading…</p>` (replaced by React; no sample-board flash).
  - `ConflictDialog` props: `{ file: AppState; browser: AppState; onUseFile(): void; onMerge(): void; onDownloadBrowser(): void }`. Uses `<dialog>` with `showModal()` in an effect; `onCancel` → `preventDefault()` (Esc must not dismiss an undecided state). Counts text: `Browser: 3 boards, 84 links · File: 5 boards, 210 links`. Title exact: `Your browser's boards differ from the saved file`.
  - `useServerSave(options: { enabled: boolean; initialRevision: number; state: AppState; replaceState(state: AppState): void; notify(message: string): void }): { track(action: Action): void }`.
    - `track` appends to a pending ref (App wraps `dispatch` as `dispatchAndTrack`; `state/replace` dispatched *by the hook itself* is not tracked).
    - Debounce 300 ms on `state` change while pending non-empty → `putServerState(revision, state)`. Snapshot the pending list at send time; on `saved` drop exactly those, set revision. On `conflict`: `replaceState(adoptState(replayPending(conflict.state, pending), state.activeBoardId))`, set revision = conflict.revision, keep pending, save again; a second consecutive conflict → `replaceState(adoptState(conflict.state, …))`, clear pending, `notify("Reloaded changes from another window; your last edit was not saved.")`. `unreachable` → `notify("Not saved: server unreachable")`, keep pending (retried on next change or focus).
    - On `visibilitychange`→visible and `focus`: if pending empty, `fetchServerState()`; if `revision` newer → `replaceState(adoptState(...))`. If pending non-empty → trigger save instead.
    - `enabled: false` → no-op.
  - `App`: prop `initial: InitialLoad`; reducer init from `initial.state`; keep the existing `saveState` effect (localStorage copy in both modes); render `ConflictDialog` while `conflict` is set. Use-file → `replaceState(file)`; Merge → `mergeStates`, PUT, notice `Merged: …`; Download → reuse existing `download("linkboard-backup.json", …)`.

- [ ] **Step 1: Write failing test** `src/ConflictDialog.test.tsx` (jsdom; stub `HTMLDialogElement.prototype.showModal` if missing): renders title and counts; buttons call their handler; `cancel` event is prevented.
- [ ] **Step 2:** FAIL. **Step 3:** Implement all files of this task. **Step 4:** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Manual check:** `npm run dev` → app behaves as before (server mode off, no errors in console). `npm run build && LINKBOARD_DATA_DIR=$(mktemp -d) PORT=8099 npm start` → opens with sample board, `linkboard.json` appears.
- [ ] **Step 6: Commit** `feat: sync app state with server storage when available`

### Task 6: Docker, README, E2E

**Files:**
- Modify: `Dockerfile`, `compose.yaml`, `README.md`
- Create: `e2e/sync.e2e.mjs`

**Interfaces:**
- Consumes: `npm run build` output `dist/`, `dist-server/main.js`; `npm start`.

- Dockerfile runtime stage: `FROM node:22-alpine`, `WORKDIR /app`, copy `dist` and `dist-server`, `ENV LINKBOARD_DATA_DIR=/data PORT=8080`, `EXPOSE 8080`, `CMD ["node", "dist-server/main.js"]`. nginx gone.
- compose: `ports: ["127.0.0.1:5173:8080"]`, `volumes: ["./data:/data"]`, `restart: unless-stopped`. Comment explains localhost binding (no auth).
- README "Run with Docker": Node server, data file `data/linkboard.json`, back up by copying it, bound to localhost only, existing browser boards migrate on first open. Replace the "tied to the address" sentence. Update Layout table with `server/` files.
- `e2e/sync.e2e.mjs`: starts `node dist-server/main.js` with temp `LINKBOARD_DATA_DIR` and `PORT=4174` as child process, waits for `/api/state`. Two `browser.newContext()`s. Context A adds `github.com/features` to News. Context B: `page.bringToFront()` / dispatch `focus` → within 3 s News contains `github.com`. Also check `linkboard.json` on disk contains the URL. Kill server in `finally`.

- [ ] **Step 1:** Write `e2e/sync.e2e.mjs`. Run `npm run build && CHROMIUM_PATH=… npm run test:e2e:sync` → PASS (it tests Task 5; failing here means a Task 5 bug).
- [ ] **Step 2:** Update Dockerfile, compose, README.
- [ ] **Step 3:** `docker compose up -d --build`; `curl -s 127.0.0.1:5173/api/state` → JSON; `ls data/linkboard.json` exists after opening the app; `docker compose down`.
- [ ] **Step 4:** Existing `npm run test:e2e` against `vite preview` still PASS (server-off path).
- [ ] **Step 5: Commit** `feat: run linkboard with node server and data volume in docker`
