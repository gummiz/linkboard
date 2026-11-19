import { describe, expect, it } from "vitest";
import { defined } from "./defined";
import { makeBoard, makeCategory, makeItem, type AppState } from "./model";
import { mergeStates } from "./merge";

function stateOf(...boards: ReturnType<typeof makeBoard>[]): AppState {
  return { version: 1, boards, activeBoardId: defined(boards[0]).id };
}

const allUrls = (state: AppState) =>
  state.boards.flatMap((board) => board.categories.flatMap((category) => category.items.map((item) => item.url)));

describe("mergeStates", () => {
  it("appends a board the file does not have", () => {
    const file = stateOf(makeBoard("Work", [makeCategory("A", "#000", [makeItem("a", "https://a.example/")])]));
    const browser = stateOf(
      makeBoard("Home", [makeCategory("B", "#111", [makeItem("b", "https://b.example/"), makeItem("c", "https://c.example/")])]),
    );
    const { state, added, skipped } = mergeStates(file, browser);
    expect(state.boards.map((board) => board.name)).toEqual(["Work", "Home"]);
    expect(added).toBe(2);
    expect(skipped).toBe(0);
    expect(state.activeBoardId).toBe(file.activeBoardId);
  });

  it("merges into a board matched by name ignoring case and whitespace", () => {
    const file = stateOf(makeBoard("Work", [makeCategory("A", "#000", [makeItem("a", "https://a.example/")])]));
    const browser = stateOf(makeBoard(" work ", [makeCategory("a", "#111", [makeItem("b", "https://b.example/")])]));
    const { state } = mergeStates(file, browser);
    expect(state.boards).toHaveLength(1);
    expect(defined(state.boards[0]).categories).toHaveLength(1);
    expect(defined(defined(state.boards[0]).categories[0]).items.map((item) => item.name)).toEqual(["a", "b"]);
  });

  it("appends an unmatched category into a matched board", () => {
    const file = stateOf(makeBoard("Work", [makeCategory("A", "#000", [makeItem("a", "https://a.example/")])]));
    const browser = stateOf(makeBoard("Work", [makeCategory("New", "#abc", [makeItem("b", "https://b.example/")])]));
    const { state } = mergeStates(file, browser);
    expect(defined(state.boards[0]).categories.map((category) => category.name)).toEqual(["A", "New"]);
    expect(defined(defined(state.boards[0]).categories[1]).color).toBe("#abc");
  });

  it("skips a link whose URL exists in another board of the file", () => {
    const file = stateOf(
      makeBoard("Work", [makeCategory("A", "#000", [makeItem("a", "https://a.example/")])]),
      makeBoard("Home", [makeCategory("B", "#000", [])]),
    );
    const browser = stateOf(makeBoard("Home", [makeCategory("B", "#000", [makeItem("dup", "https://a.example/")])]));
    const { state, added, skipped } = mergeStates(file, browser);
    expect(skipped).toBe(1);
    expect(added).toBe(0);
    expect(allUrls(state)).toEqual(["https://a.example/"]);
  });

  it("treats https://example.com and example.com/ as the same link", () => {
    const file = stateOf(makeBoard("W", [makeCategory("A", "#000", [makeItem("a", "https://example.com/")])]));
    const browser = stateOf(makeBoard("W", [makeCategory("A", "#000", [makeItem("b", "example.com/")])]));
    const { added, skipped } = mergeStates(file, browser);
    expect(added).toBe(0);
    expect(skipped).toBe(1);
  });

  it("does not merge clicks or notes of skipped links", () => {
    const fileItem = makeItem("a", "https://a.example/", "file note");
    const file = stateOf(makeBoard("W", [makeCategory("A", "#000", [fileItem])]));
    const browserItem = { ...makeItem("a", "https://a.example/", "browser note"), clicks: 9 };
    const browser = stateOf(makeBoard("W", [makeCategory("A", "#000", [browserItem])]));
    const { state } = mergeStates(file, browser);
    const merged = defined(defined(state.boards[0]).categories[0]).items;
    expect(merged).toHaveLength(1);
    expect(defined(merged[0]).note).toBe("file note");
    expect(defined(merged[0]).clicks).toBe(0);
  });

  it("added entities get ids that do not collide", () => {
    const fileItem = makeItem("a", "https://a.example/");
    const file = stateOf(makeBoard("W", [makeCategory("A", "#000", [fileItem])]));
    const browserItem = { ...makeItem("b", "https://b.example/"), id: fileItem.id };
    const browserCategory = makeCategory("New", "#000", [browserItem]);
    const browserBoard = makeBoard("Other", [{ ...browserCategory, id: defined(defined(file.boards[0]).categories[0]).id }]);
    const { state } = mergeStates(file, stateOf({ ...browserBoard, id: defined(file.boards[0]).id }));
    const ids = state.boards.flatMap((board) => [
      board.id,
      ...board.categories.flatMap((category) => [category.id, ...category.items.map((item) => item.id)]),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never produces duplicate URLs", () => {
    const file = stateOf(makeBoard("W", [makeCategory("A", "#000", [])]));
    const browser = stateOf(
      makeBoard("W", [
        makeCategory("A", "#000", [makeItem("x", "https://x.example/"), makeItem("x2", "https://x.example/")]),
      ]),
    );
    const { state, added, skipped } = mergeStates(file, browser);
    expect(allUrls(state)).toEqual(["https://x.example/"]);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
  });

  it("drops a fully duplicate category but keeps an empty one, without mutating inputs", () => {
    const file = stateOf(makeBoard("W", [makeCategory("A", "#000", [makeItem("a", "https://a.example/")])]));
    const browser = stateOf(
      makeBoard("W", [
        makeCategory("Dup", "#000", [makeItem("a", "https://a.example/")]),
        makeCategory("Empty", "#000", []),
      ]),
    );
    const fileBefore = structuredClone(file);
    const browserBefore = structuredClone(browser);
    const { state } = mergeStates(file, browser);
    expect(defined(state.boards[0]).categories.map((category) => category.name)).toEqual(["A", "Empty"]);
    expect(file).toEqual(fileBefore);
    expect(browser).toEqual(browserBefore);
  });
});
