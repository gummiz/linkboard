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

Builds the app and serves it with nginx at http://localhost:5173. The container
restarts on its own whenever Docker runs; enable "Start Docker Desktop when you
sign in" so it is up after a reboot.

```bash
docker compose up -d --build   # build and start
docker compose down            # stop
```

Rerun the first command after code changes. Port 5173 matches the dev server on
purpose: boards live in `localStorage`, which is tied to the address.

## Layout

| Path | Purpose |
| --- | --- |
| `src/model.ts` | Data types, URL normalization, hot-link ranking, sample board |
| `src/store.ts` | Reducer for every board, category and link change |
| `src/storage.ts` | Validating load/save of `localStorage` and imported JSON |
| `src/bookmarks.ts` | Netscape bookmark file import and export |
| `src/search.ts` | Cross-board search ranking |
| `src/*.tsx` | React UI |
| `e2e/app.e2e.mjs` | Playwright browser test |
