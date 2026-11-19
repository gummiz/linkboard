import { describe, expect, it } from "vitest";
import { defined } from "./defined";
import { hotItemIds, makeBoard, makeCategory, makeItem, normalizeUrl, type AppState } from "./model";
import { activeBoard, reducer } from "./store";

function fixture() {
  const a = makeItem("A", "https://a.example/");
  const b = makeItem("B", "https://b.example/");
  const c = makeItem("C", "https://c.example/");
  const d = makeItem("D", "https://d.example/");
  const left = makeCategory("Left", "#000", [a, b, c]);
  const right = makeCategory("Right", "#fff", [d]);
  const board = makeBoard("Board", [left, right]);
  const state: AppState = { version: 1, boards: [board], activeBoardId: board.id };
  return { state, board, left, right, a, b, c, d };
}

const names = (state: AppState, categoryIndex: number) =>
  defined(activeBoard(state).categories[categoryIndex]).items.map((item) => item.name);

describe("item/move", () => {
  it("moves an item down within a category, inserting before the target slot", () => {
    const { state, board, left, a } = fixture();
    const next = reducer(state, { type: "item/move", boardId: board.id, itemId: a.id, toCategoryId: left.id, toIndex: 2 });
    expect(names(next, 0)).toEqual(["B", "A", "C"]);
  });

  it("moves an item up within a category", () => {
    const { state, board, left, c } = fixture();
    const next = reducer(state, { type: "item/move", boardId: board.id, itemId: c.id, toCategoryId: left.id, toIndex: 0 });
    expect(names(next, 0)).toEqual(["C", "A", "B"]);
  });

  it("moves an item to the end of a category", () => {
    const { state, board, left, a } = fixture();
    const next = reducer(state, { type: "item/move", boardId: board.id, itemId: a.id, toCategoryId: left.id, toIndex: 3 });
    expect(names(next, 0)).toEqual(["B", "C", "A"]);
  });

  it("moves an item between categories at the requested slot", () => {
    const { state, board, right, b } = fixture();
    const next = reducer(state, { type: "item/move", boardId: board.id, itemId: b.id, toCategoryId: right.id, toIndex: 0 });
    expect(names(next, 0)).toEqual(["A", "C"]);
    expect(names(next, 1)).toEqual(["B", "D"]);
  });

  it("ignores unknown items and categories", () => {
    const { state, board, left, a } = fixture();
    expect(reducer(state, { type: "item/move", boardId: board.id, itemId: "nope", toCategoryId: left.id, toIndex: 0 })).toBe(state);
    expect(reducer(state, { type: "item/move", boardId: board.id, itemId: a.id, toCategoryId: "nope", toIndex: 0 })).toBe(state);
  });
});

describe("category/move", () => {
  it("reorders categories", () => {
    const { state, board, right } = fixture();
    const next = reducer(state, { type: "category/move", boardId: board.id, categoryId: right.id, toIndex: 0 });
    expect(activeBoard(next).categories.map((category) => category.name)).toEqual(["Right", "Left"]);
  });
});

describe("items", () => {
  it("adds at a slot, edits, counts clicks and deletes", () => {
    const { state, board, right, d } = fixture();
    const e = makeItem("E", "https://e.example/");
    let next = reducer(state, { type: "item/add", boardId: board.id, categoryId: right.id, item: e, toIndex: 0 });
    expect(names(next, 1)).toEqual(["E", "D"]);
    next = reducer(next, { type: "item/update", boardId: board.id, itemId: d.id, patch: { name: "Dee", note: "hi" } });
    next = reducer(next, { type: "item/click", boardId: board.id, itemId: d.id });
    next = reducer(next, { type: "item/click", boardId: board.id, itemId: d.id });
    const dee = defined(defined(activeBoard(next).categories[1]).items[1]);
    expect(dee).toMatchObject({ name: "Dee", note: "hi", clicks: 2 });
    next = reducer(next, { type: "item/delete", boardId: board.id, itemId: e.id });
    expect(names(next, 1)).toEqual(["Dee"]);
  });
});

describe("boards", () => {
  it("selects the neighbouring board after deleting the active one", () => {
    const { state } = fixture();
    let next = reducer(state, { type: "board/add", name: "Second" });
    const second = next.activeBoardId;
    next = reducer(next, { type: "board/delete", boardId: second });
    expect(next.boards).toHaveLength(1);
    expect(next.activeBoardId).toBe(defined(state.boards[0]).id);
  });

  it("always keeps one board", () => {
    const { state, board } = fixture();
    const next = reducer(state, { type: "board/delete", boardId: board.id });
    expect(next.boards).toHaveLength(1);
    expect(next.activeBoardId).toBe(defined(next.boards[0]).id);
    expect(next.activeBoardId).not.toBe(board.id);
  });
});

describe("normalizeUrl", () => {
  it.each([
    ["example.com", "https://example.com/"],
    ["  http://example.com/a?b=1 ", "http://example.com/a?b=1"],
    ["http://localhost:3000", "http://localhost:3000/"],
  ])("accepts %s", (input, expected) => { expect(normalizeUrl(input)).toBe(expected); });

  it.each(["", "javascript:alert(1)", "ftp://example.com", "not a url", "hello"])("rejects %j", (input) => { expect(normalizeUrl(input)).toBeNull(); },
  );
});

describe("hotItemIds", () => {
  it("marks up to three most-clicked items above the threshold", () => {
    const items = [5, 0, 9, 3, 7, 2].map((clicks, index) => ({ ...makeItem(`${index}`, "https://x.example/"), clicks }));
    const hot = hotItemIds(makeCategory("c", "#000", items));
    expect([...hot].map((id) => defined(items.find((item) => item.id === id)).clicks)).toEqual([9, 7, 5]);
  });
});
