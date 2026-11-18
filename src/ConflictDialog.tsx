import { useEffect, useId, useRef } from "react";
import type { AppState } from "./model";

type ConflictDialogProps = {
  file: AppState;
  browser: AppState;
  statusMessage?: string | null;
  onUseFile(): void;
  onMerge(): void;
  onDownloadBrowser(): void;
};

function describeContents(state: AppState): string {
  const linkCount = state.boards.reduce(
    (boardTotal, board) =>
      boardTotal + board.categories.reduce((categoryTotal, category) => categoryTotal + category.items.length, 0),
    0,
  );
  const boardLabel = state.boards.length === 1 ? "board" : "boards";
  const linkLabel = linkCount === 1 ? "link" : "links";
  return `${state.boards.length} ${boardLabel}, ${linkCount} ${linkLabel}`;
}

export function ConflictDialog({
  file,
  browser,
  statusMessage = null,
  onUseFile,
  onMerge,
  onDownloadBrowser,
}: ConflictDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current!;
    // StrictMode runs this effect twice; showModal() on an open dialog can throw.
    if (!dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="conflict-dialog"
      aria-labelledby={titleId}
      // Esc must not dismiss an undecided state.
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id={titleId}>Your browser's boards differ from the saved file</h2>
      <p>
        Browser: {describeContents(browser)} · File: {describeContents(file)}
      </p>
      <button type="button" onClick={onDownloadBrowser}>
        Download browser boards as backup
      </button>
      {statusMessage !== null && <p role="status">{statusMessage}</p>}
      <div className="conflict-dialog-actions">
        <button type="button" onClick={onUseFile}>
          Use the file
        </button>
        <button type="button" className="primary" onClick={onMerge}>
          Merge into the file
        </button>
      </div>
    </dialog>
  );
}
