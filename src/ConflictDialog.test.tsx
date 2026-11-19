import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defined } from "./defined";
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
  return { version: 1, boards, activeBoardId: defined(boards[0]).id };
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
    expect(screen.getByRole("dialog", { name: "This browser has its own boards" })).toBeTruthy();
    expect(screen.getByText("5 boards · 10 links")).toBeTruthy();
    expect(screen.getByText("3 boards · 3 links")).toBeTruthy();
  });

  it("describes what keeping the shared boards discards", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /^Keep the shared boards/ }).getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/This browser's 3 links are discarded\./)).toBeTruthy();
  });

  it("uses a singular verb for a single discarded link", () => {
    render(
      <ConflictDialog
        file={stateWithLinks(1, 2)}
        browser={stateWithLinks(1, 1)}
        onUseFile={vi.fn()}
        onMerge={vi.fn()}
        onDownloadBrowser={vi.fn()}
      />,
    );
    expect(screen.getByText(/This browser's 1 link is discarded\./)).toBeTruthy();
  });

  it("calls the matching handler for each button", () => {
    const handlers = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Save a backup of this browser's boards first" }));
    fireEvent.click(screen.getByRole("button", { name: /^Keep the shared boards/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Add this browser's links/ }));
    expect(handlers.onDownloadBrowser).toHaveBeenCalledTimes(1);
    expect(handlers.onUseFile).toHaveBeenCalledTimes(1);
    expect(handlers.onMerge).toHaveBeenCalledTimes(1);
  });

  it("labels the shared and the browser counts", () => {
    renderDialog();
    expect(screen.getByText("Shared").tagName).toBe("DT");
    expect(screen.getByText("In this browser").tagName).toBe("DT");
    expect(screen.queryByText("Only in this browser")).toBeNull();
  });

  it("returns focus to the previously focused element on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const handlers = { onUseFile: vi.fn(), onMerge: vi.fn(), onDownloadBrowser: vi.fn() };
    const { unmount } = render(<ConflictDialog file={stateWithLinks(1, 1)} browser={stateWithLinks(1, 1)} {...handlers} />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("does not crash when the previously focused element is gone", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const handlers = { onUseFile: vi.fn(), onMerge: vi.fn(), onDownloadBrowser: vi.fn() };
    const { unmount } = render(<ConflictDialog file={stateWithLinks(1, 1)} browser={stateWithLinks(1, 1)} {...handlers} />);
    opener.remove();
    expect(() => { unmount(); }).not.toThrow();
  });

  it("prevents Escape from dismissing the dialog", () => {
    renderDialog();
    const cancelEvent = new Event("cancel", { cancelable: true });
    screen.getByRole("dialog").dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
  });
});
