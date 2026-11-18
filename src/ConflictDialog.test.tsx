import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConflictDialog } from "./ConflictDialog";
import { makeBoard, makeCategory, makeItem, type AppState } from "./model";

function stateWithLinks(boardCount: number, linksPerBoard: number): AppState {
  const boards = Array.from({ length: boardCount }, (_, boardIndex) =>
    makeBoard(
      `Board ${boardIndex}`,
      [
        makeCategory(
          "Links",
          "#2563eb",
          Array.from({ length: linksPerBoard }, (_, linkIndex) =>
            makeItem(`Link ${linkIndex}`, `https://example.com/${boardIndex}/${linkIndex}`),
          ),
        ),
      ],
    ),
  );
  return { version: 1, boards, activeBoardId: boards[0]!.id };
}

beforeAll(() => {
  // jsdom has no modal support for <dialog>.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

afterEach(cleanup);

function renderDialog() {
  const handlers = { onUseFile: vi.fn(), onMerge: vi.fn(), onDownloadBrowser: vi.fn() };
  render(<ConflictDialog file={stateWithLinks(5, 2)} browser={stateWithLinks(3, 1)} {...handlers} />);
  return handlers;
}

describe("ConflictDialog", () => {
  it("shows the title and the board and link counts", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Your browser's boards differ from the saved file" })).toBeTruthy();
    expect(screen.getByText("Browser: 3 boards, 3 links · File: 5 boards, 10 links")).toBeTruthy();
  });

  it("calls the matching handler for each button", () => {
    const handlers = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Download browser boards as backup" }));
    fireEvent.click(screen.getByRole("button", { name: "Use the file" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge into the file" }));
    expect(handlers.onDownloadBrowser).toHaveBeenCalledTimes(1);
    expect(handlers.onUseFile).toHaveBeenCalledTimes(1);
    expect(handlers.onMerge).toHaveBeenCalledTimes(1);
  });

  it("prevents Escape from dismissing the dialog", () => {
    renderDialog();
    const cancelEvent = new Event("cancel", { cancelable: true });
    screen.getByRole("dialog").dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
  });
});
