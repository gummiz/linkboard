import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import type { InitialLoad } from "./bootstrap";
import { exportBookmarksHtml, importBookmarksHtml } from "./bookmarks";
import { BoardView } from "./BoardView";
import { ConflictDialog } from "./ConflictDialog";
import { mergeStates } from "./merge";
import type { AppState } from "./model";
import { SearchBox } from "./SearchBox";
import { Sidebar } from "./Sidebar";
import { pluralize } from "./pluralize";
import { getStorageStatus, parseBoard, parseState, saveState, subscribeStorageStatus } from "./storage";
import { adoptState } from "./serverSync";
import { activeBoard, reducer, type Action } from "./store";
import { useServerSave } from "./useServerSave";

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const STORAGE_FAILING_NOTICE = "This browser is not saving changes (storage is blocked or full).";

export function App({ initial }: { initial: InitialLoad }) {
  const [state, dispatch] = useReducer(reducer, initial.state);
  const [conflict, setConflict] = useState(initial.mode === "server" ? (initial.conflict ?? null) : null);
  const [notice, setNotice] = useState<string | null>(initial.mode === "local" ? (initial.notice ?? null) : null);
  const [mergeInFlight, setMergeInFlight] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const storageStatus = useSyncExternalStore(subscribeStorageStatus, getStorageStatus);
  const board = activeBoard(state);
  const localSaveFailing = initial.mode === "local" && storageStatus === "failing";
  const visibleNotice = notice ?? (localSaveFailing ? STORAGE_FAILING_NOTICE : null);

  const { track, saveImmediately } = useServerSave({
    enabled: initial.mode === "server" && conflict === null,
    initialRevision: initial.mode === "server" ? initial.revision : 0,
    state,
    replaceState: (replacement) => { dispatch({ type: "state/replace", state: replacement }); },
    notify: setNotice,
  });

  const dispatchAndTrack = (action: Action) => {
    dispatch(action);
    // Only edits that change something are replayed; a no-op replay then reliably means "target gone".
    if (reducer(state, action) !== state) track(action);
  };

  // While the conflict dialog is open, localStorage still holds the browser's own boards.
  useEffect(() => {
    if (conflict !== null) return;
    saveState(state);
  }, [state, conflict]);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => { setNotice(null); }, 5000);
    return () => { clearTimeout(timer); };
  }, [notice]);

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    const text = await file.text();
    if (/\.json$/i.test(file.name)) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        setNotice(`${file.name} is not valid JSON.`);
        return;
      }
      const restored = parseState(json);
      if (restored !== null) {
        if (window.confirm(`Replace all boards with the ${restored.boards.length} in ${file.name}?`)) {
          dispatchAndTrack({ type: "state/replace", state: restored });
        }
        return;
      }
      const sharedBoard = parseBoard(json);
      if (sharedBoard === null) {
        setNotice(`${file.name} is not a Linkboard export.`);
        return;
      }
      dispatchAndTrack({ type: "board/add", board: { ...sharedBoard, id: crypto.randomUUID() } });
      setNotice(`Added board "${sharedBoard.name}".`);
      return;
    }
    const result = importBookmarksHtml(text, file.name.replace(/\.[^.]+$/, "") || "Imported");
    if (result.imported === 0) {
      setNotice(`No links found in ${file.name}.`);
      return;
    }
    for (const board of result.boards) dispatchAndTrack({ type: "board/add", board });
    setNotice(
      `Imported ${pluralize(result.imported, "link")} into ${pluralize(result.boards.length, "board")}` +
        (result.skipped > 0 ? ` (skipped ${result.skipped} non-web links).` : "."),
    );
  };

  const onMerge = async () => {
    if (conflict === null || mergeInFlight) return;
    setMergeInFlight(true);
    try {
      await mergeIntoFile(conflict);
    } catch (error) {
      setNotice(`Not saved: ${(error as Error).message}`);
    } finally {
      setMergeInFlight(false);
    }
  };

  const mergeIntoFile = async (conflict: { file: AppState; browser: AppState }) => {
    const { browser } = conflict;
    let { file } = conflict;
    // One retry: another window may have saved between first contact and the merge.
    for (let attempt = 0; attempt < 2; attempt++) {
      const merged = mergeStates(file, browser);
      const result = await saveImmediately(merged.state);
      if (result.kind === "saved") {
        dispatch({ type: "state/replace", state: adoptState(merged.state, browser.activeBoardId) });
        setConflict(null);
        setNotice(`Added ${pluralize(merged.added, "link")} to the shared boards (${merged.skipped} already there).`);
        return;
      }
      if (result.kind === "unreachable") {
        setNotice("Not saved: server unreachable");
        return;
      }
      file = result.state;
    }
    setNotice("Not saved: the file kept changing in another window. Try again.");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={24} height={24} />
          <span>Linkboard</span>
        </div>
        <SearchBox state={state} dispatch={dispatchAndTrack} />
        <div className="topbar-actions">
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".html,.htm,.json"
            hidden
            onChange={(event) => void onImport(event)}
          />
          <details className="menu">
            <summary>Export</summary>
            <div className="menu-panel">
              <button
                type="button"
                onClick={() => { download("bookmarks.html", exportBookmarksHtml(state.boards), "text/html"); }}
              >
                All boards as browser bookmarks (.html)
              </button>
              <button
                type="button"
                onClick={() => { download("linkboard-backup.json", JSON.stringify(state, null, 2), "application/json"); }}
              >
                Full backup (.json)
              </button>
              <button
                type="button"
                onClick={() => {
                  download(`${board.name}.linkboard.json`, JSON.stringify(board, null, 2), "application/json");
                }}
              >
                This board, to share (.json)
              </button>
            </div>
          </details>
        </div>
      </header>
      <Sidebar state={state} dispatch={dispatchAndTrack} />
      <main className="main">
        <BoardView board={board} dispatch={dispatchAndTrack} />
      </main>
      {conflict !== null && (
        <ConflictDialog
          file={conflict.file}
          browser={conflict.browser}
          statusMessage={notice}
          busy={mergeInFlight}
          onUseFile={() => {
            dispatch({ type: "state/replace", state: adoptState(conflict.file, conflict.browser.activeBoardId) });
            setConflict(null);
          }}
          onMerge={() => void onMerge()}
          onDownloadBrowser={() => {
            download("linkboard-backup.json", JSON.stringify(conflict.browser, null, 2), "application/json");
          }}
        />
      )}
      {visibleNotice !== null && (
        <div className="notice" role="status">
          {visibleNotice}
        </div>
      )}
    </div>
  );
}
