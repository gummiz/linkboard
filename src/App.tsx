import { useEffect, useReducer, useRef, useState, type ChangeEvent } from "react";
import { exportBookmarksHtml, importBookmarksHtml } from "./bookmarks";
import { BoardView } from "./BoardView";
import { sampleState } from "./model";
import { SearchBox } from "./SearchBox";
import { Sidebar } from "./Sidebar";
import { loadState, parseBoard, parseState, saveState } from "./storage";
import { activeBoard, reducer } from "./store";

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? sampleState());
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const board = activeBoard(state);

  useEffect(() => {
    if (!saveState(state)) setNotice("This browser is not saving changes (storage is blocked or full).");
  }, [state]);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
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
          dispatch({ type: "state/replace", state: restored });
        }
        return;
      }
      const sharedBoard = parseBoard(json);
      if (sharedBoard === null) {
        setNotice(`${file.name} is not a Linkboard export.`);
        return;
      }
      dispatch({ type: "board/add", board: { ...sharedBoard, id: crypto.randomUUID() } });
      setNotice(`Added board "${sharedBoard.name}".`);
      return;
    }
    const result = importBookmarksHtml(text, file.name.replace(/\.[^.]+$/, "") || "Imported");
    if (result.imported === 0) {
      setNotice(`No links found in ${file.name}.`);
      return;
    }
    for (const board of result.boards) dispatch({ type: "board/add", board });
    setNotice(
      `Imported ${plural(result.imported, "link")} into ${plural(result.boards.length, "board")}` +
        (result.skipped > 0 ? ` (skipped ${result.skipped} non-web links).` : "."),
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={24} height={24} />
          <span>Linkboard</span>
        </div>
        <SearchBox state={state} dispatch={dispatch} />
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
                onClick={() => download("bookmarks.html", exportBookmarksHtml(state.boards), "text/html")}
              >
                All boards as browser bookmarks (.html)
              </button>
              <button
                type="button"
                onClick={() => download("linkboard-backup.json", JSON.stringify(state, null, 2), "application/json")}
              >
                Full backup (.json)
              </button>
              <button
                type="button"
                onClick={() =>
                  download(`${board.name}.linkboard.json`, JSON.stringify(board, null, 2), "application/json")
                }
              >
                This board, to share (.json)
              </button>
            </div>
          </details>
        </div>
      </header>
      <Sidebar state={state} dispatch={dispatch} />
      <main className="main">
        <BoardView board={board} dispatch={dispatch} />
      </main>
      {notice !== null && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
