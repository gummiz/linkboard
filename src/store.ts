import { defined } from "./defined";
import { makeBoard, makeCategory, type AppState, type Board, type Category, type Item } from "./model";

export type Action =
  | { type: "state/replace"; state: AppState }
  | { type: "board/add"; board?: Board; name?: string }
  | { type: "board/select"; boardId: string }
  | { type: "board/update"; boardId: string; patch: Partial<Pick<Board, "name">> }
  | { type: "board/delete"; boardId: string }
  | { type: "category/add"; boardId: string; name: string; color: string }
  | {
      type: "category/update";
      boardId: string;
      categoryId: string;
      patch: Partial<Pick<Category, "name" | "color" | "collapsed" | "showAll">>;
    }
  | { type: "category/delete"; boardId: string; categoryId: string }
  /** `toIndex` is the slot in the board's current category list to insert before. */
  | { type: "category/move"; boardId: string; categoryId: string; toIndex: number }
  /** Appends unless `toIndex` names the slot to insert before. */
  | { type: "item/add"; boardId: string; categoryId: string; item: Item; toIndex?: number }
  | {
      type: "item/update";
      boardId: string;
      itemId: string;
      patch: Partial<Pick<Item, "name" | "url" | "note">>;
    }
  | { type: "item/delete"; boardId: string; itemId: string }
  /** `toIndex` is the slot in the target category's current item list to insert before. */
  | { type: "item/move"; boardId: string; itemId: string; toCategoryId: string; toIndex: number }
  | { type: "item/click"; boardId: string; itemId: string };

function moveWithin<T>(list: readonly T[], from: number, toIndex: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  const insertAt = clamp(from < toIndex ? toIndex - 1 : toIndex, 0, next.length);
  next.splice(insertAt, 0, moved);
  return next;
}

function insertAt<T>(list: readonly T[], value: T, index = list.length): T[] {
  const next = list.slice();
  next.splice(clamp(index, 0, next.length), 0, value);
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function updateBoard(state: AppState, boardId: string, update: (board: Board) => Board): AppState {
  const boards = state.boards.map((board) => (board.id === boardId ? update(board) : board));
  return boards.some((board, index) => board !== state.boards[index]) ? { ...state, boards } : state;
}

function updateCategories(board: Board, update: (category: Category) => Category): Board {
  const categories = board.categories.map(update);
  return categories.some((category, index) => category !== board.categories[index]) ? { ...board, categories } : board;
}

function updateItem(board: Board, itemId: string, update: (item: Item) => Item): Board {
  return updateCategories(board, (category) => {
    const index = category.items.findIndex((item) => item.id === itemId);
    const current = category.items[index];
    if (current === undefined) return category;
    const items = category.items.slice();
    items[index] = update(current);
    return { ...category, items };
  });
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "state/replace":
      return action.state;

    case "board/add": {
      const board = action.board ?? makeBoard(action.name ?? "Untitled board");
      return { ...state, boards: [...state.boards, board], activeBoardId: board.id };
    }

    case "board/select":
      return state.boards.some((board) => board.id === action.boardId)
        ? { ...state, activeBoardId: action.boardId }
        : state;

    case "board/update":
      return updateBoard(state, action.boardId, (board) => ({ ...board, ...action.patch }));

    case "board/delete": {
      const index = state.boards.findIndex((board) => board.id === action.boardId);
      if (index === -1) return state;
      const boards = state.boards.filter((board) => board.id !== action.boardId);
      if (boards.length === 0) boards.push(makeBoard("My Board"));
      const activeBoardId =
        state.activeBoardId === action.boardId
          ? defined(boards[Math.min(index, boards.length - 1)], "a board to activate").id
          : state.activeBoardId;
      return { ...state, boards, activeBoardId };
    }

    case "category/add":
      return updateBoard(state, action.boardId, (board) => ({
        ...board,
        categories: [...board.categories, makeCategory(action.name, action.color)],
      }));

    case "category/update":
      return updateBoard(state, action.boardId, (board) =>
        updateCategories(board, (category) =>
          category.id === action.categoryId ? { ...category, ...action.patch } : category,
        ),
      );

    case "category/delete":
      return updateBoard(state, action.boardId, (board) => ({
        ...board,
        categories: board.categories.filter((category) => category.id !== action.categoryId),
      }));

    case "category/move":
      return updateBoard(state, action.boardId, (board) => {
        const from = board.categories.findIndex((category) => category.id === action.categoryId);
        if (from === -1) return board;
        return { ...board, categories: moveWithin(board.categories, from, action.toIndex) };
      });

    case "item/add":
      return updateBoard(state, action.boardId, (board) =>
        updateCategories(board, (category) =>
          category.id === action.categoryId
            ? { ...category, items: insertAt(category.items, action.item, action.toIndex) }
            : category,
        ),
      );

    case "item/update":
      return updateBoard(state, action.boardId, (board) =>
        updateItem(board, action.itemId, (item) => ({ ...item, ...action.patch })),
      );

    case "item/click":
      return updateBoard(state, action.boardId, (board) =>
        updateItem(board, action.itemId, (item) => ({ ...item, clicks: item.clicks + 1 })),
      );

    case "item/delete":
      return updateBoard(state, action.boardId, (board) =>
        updateCategories(board, (category) =>
          category.items.some((item) => item.id === action.itemId)
            ? { ...category, items: category.items.filter((item) => item.id !== action.itemId) }
            : category,
        ),
      );

    case "item/move":
      return updateBoard(state, action.boardId, (board) => moveItem(board, action));
  }
}

function moveItem(board: Board, action: Extract<Action, { type: "item/move" }>): Board {
  const source = board.categories.find((category) =>
    category.items.some((item) => item.id === action.itemId),
  );
  const target = board.categories.find((category) => category.id === action.toCategoryId);
  if (source === undefined || target === undefined) return board;
  const from = source.items.findIndex((item) => item.id === action.itemId);

  if (source.id === target.id) {
    return updateCategories(board, (category) =>
      category.id === source.id
        ? { ...category, items: moveWithin(category.items, from, action.toIndex) }
        : category,
    );
  }

  const moved = source.items[from];
  if (moved === undefined) return board;
  return updateCategories(board, (category) => {
    if (category.id === source.id) {
      return { ...category, items: category.items.filter((item) => item.id !== moved.id) };
    }
    if (category.id === target.id) {
      return { ...category, items: insertAt(category.items, moved, action.toIndex) };
    }
    return category;
  });
}

export function activeBoard(state: AppState): Board {
  return state.boards.find((board) => board.id === state.activeBoardId) ?? defined(state.boards[0], "a board");
}
