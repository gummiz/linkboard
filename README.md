# Linkboard

A board-based bookmark manager. Each board holds colored categories of links in
a 2D grid, so the links you use most are one glance away. It runs entirely in
your browser and stores data in `localStorage`.

![Linkboard showing a board with Tools, Getting started, News and Reference categories](docs/screenshot.png)

The feature set comes from an [REA](https://github.com/morluto/rea) analysis of
[papaly.com](https://papaly.com/); see [docs/rea-analysis.md](docs/rea-analysis.md)
for what was observed and what was inferred. This is an independent
implementation with no Papaly code, assets or branding.

## Features

- **Boards and categories**: create, rename and delete boards; add categories
  with one of eight colors; collapse a category to its header.
- **Links**: paste a URL (with or without `https://`) to add it; edit the name,
  URL and a note; move a link to another category from its editor.
- **Drag and drop**: reorder links within a category, move them between
  categories, reorder categories, or drop a link dragged from another tab.
- **"+ N more"**: categories show six links until expanded.
- **Hot links**: the three most-opened links in a category (three or more
  opens) get a marker.
- **Search**: press `/` to search every board by name, URL, note or category;
  use arrow keys and Enter to open a result.
- **Import / export**: import a browser bookmarks file (Chrome, Firefox,
  Safari, Edge); top-level folders become boards, subfolders categories.
  Export everything as a bookmarks file, a full JSON backup, or a single board
  as JSON to share.
- Responsive layout and dark mode.

Favicons load from each site's own `/favicon.ico`; no third-party icon service
is contacted. Sites without one get a letter tile.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # production build in dist/
```

Browser test (drag and drop, search, import, persistence, phone layout, page
errors):

```bash
npm run build
npx vite preview --port 4173 &
npm run test:e2e   # uses installed Chrome, or set CHROMIUM_PATH
```

## Run with Docker

Builds the app and serves it with a small Node server at http://localhost:5173.
Boards are stored in `data/linkboard.json` on the host, so every browser sees
the same boards. The container restarts on its own whenever Docker runs; enable
"Start Docker Desktop when you sign in" so it is up after a reboot.

```bash
docker compose up -d --build   # build and start
docker compose down            # stop
```

Rerun the first command after code changes. Back up by copying
`data/linkboard.json`.

The port is bound to `127.0.0.1` only. There is no login, so don't publish it
to your network. `npm start` outside Docker listens on all interfaces, also
without a login, so run it only on a trusted machine (or use the compose file,
which binds to `127.0.0.1`).

Boards already in a browser's `localStorage` move into the file automatically
the first time you open the app. If the browser and the file both hold
different boards, a dialog asks which to keep. Without the server (`npm run dev`,
`vite preview`, static hosting) the app still uses `localStorage` only.

## Layout

| Path | Purpose |
| --- | --- |
| `src/model.ts` | Data types, URL normalization, hot-link ranking, sample board |
| `src/store.ts` | Reducer for every board, category and link change |
| `src/storage.ts` | Validating load/save of `localStorage` and imported JSON |
| `src/bookmarks.ts` | Netscape bookmark file import and export |
| `src/search.ts` | Cross-board search ranking |
| `src/*.tsx` | React UI |
| `server/server.ts` | HTTP handler: static files plus `GET`/`PUT /api/state` |
| `server/stateFile.ts` | Atomic read and write of `data/linkboard.json` |
| `server/main.ts` | Server entry: reads `LINKBOARD_DATA_DIR`, `PORT`, `DIST_DIR` |
| `e2e/app.e2e.mjs` | Playwright browser test |
| `e2e/sync.e2e.mjs` | Playwright test: two browsers sync through the server |
