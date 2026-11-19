import { useEffect, useId, useRef } from "react";
import type { AppState } from "./model";
import { pluralize } from "./pluralize";

type ConflictDialogProps = {
  file: AppState;
  browser: AppState;
  statusMessage?: string | null;
  busy?: boolean;
  onUseFile: () => void;
  onMerge: () => void;
  onDownloadBrowser: () => void;
};

function countContents(state: AppState) {
  const linkCount = state.boards.reduce(
    (boardTotal, board) =>
      boardTotal + board.categories.reduce((categoryTotal, category) => categoryTotal + category.items.length, 0),
    0,
  );
  return { boardCount: state.boards.length, linkCount };
}

function describeContents(state: AppState): string {
  const { boardCount, linkCount } = countContents(state);
  return `${pluralize(boardCount, "board")} · ${pluralize(linkCount, "link")}`;
}

export function ConflictDialog({
  file,
  browser,
  statusMessage = null,
  busy = false,
  onUseFile,
  onMerge,
  onDownloadBrowser,
}: ConflictDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const introId = useId();
  const keepDescriptionId = useId();
  const addDescriptionId = useId();
  const browserLinkCount = countContents(browser).linkCount;

  // Read during render: opening the dialog moves focus before any effect can read it.
  const elementFocusedBeforeOpen = useRef(document.activeElement);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const previous = elementFocusedBeforeOpen.current;
    // StrictMode runs this effect twice; showModal() on an open dialog can throw.
    if (!dialog.open) dialog.showModal();
    keepButton.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="conflict-dialog"
      aria-labelledby={titleId}
      aria-describedby={introId}
      // Esc must not dismiss an undecided state.
      onCancel={(event) => { event.preventDefault(); }}
    >
      <h2 id={titleId}>This browser has its own boards</h2>
      <p id={introId} className="conflict-dialog-intro">
        Linkboard now keeps one shared copy of your boards for all your browsers. This browser still has an older copy
        of its own.
      </p>
      <dl className="conflict-dialog-counts">
        <dt>Shared</dt>
        <dd>{describeContents(file)}</dd>
        <dt>In this browser</dt>
        <dd>{describeContents(browser)}</dd>
      </dl>
      <div className="conflict-dialog-choices">
        <button
          type="button"
          className="conflict-choice"
          ref={keepButton}
          aria-label="Keep the shared boards"
          aria-describedby={keepDescriptionId}
          disabled={busy}
          onClick={onUseFile}
        >
          <span className="conflict-choice-title">Keep the shared boards</span>
          <span id={keepDescriptionId} className="conflict-choice-text">
            This browser's {browserLinkCount === 0 ? "boards" : pluralize(browserLinkCount, "link")}{" "}
            {browserLinkCount === 1 ? "is" : "are"} discarded. The
            shared boards stay as they are.
          </span>
        </button>
        <button
          type="button"
          className="conflict-choice"
          aria-label="Add this browser's links"
          aria-describedby={addDescriptionId}
          disabled={busy}
          onClick={onMerge}
        >
          <span className="conflict-choice-title">Add this browser's links</span>
          <span id={addDescriptionId} className="conflict-choice-text">
            Links that aren't in the shared boards yet are added. Nothing is deleted or doubled.
          </span>
        </button>
      </div>
      {statusMessage !== null && (
        <p role="status" className="conflict-dialog-status">
          {statusMessage}
        </p>
      )}
      <p className="conflict-dialog-backup">
        Unsure?{" "}
        <button type="button" className="link-button" onClick={onDownloadBrowser}>
          Save a backup of this browser's boards first
        </button>
      </p>
    </dialog>
  );
}
