import { type AppState, type Board, type Category, type Item } from "./model";

const STORAGE_KEY = "linkboard:v1";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseItem(value: unknown): Item | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  const name = str(value.name);
  const url = str(value.url);
  if (id === null || name === null || url === null) return null;
  const clicks = typeof value.clicks === "number" && Number.isFinite(value.clicks) ? value.clicks : 0;
  return { id, name, url, note: str(value.note) ?? "", clicks: Math.max(0, Math.floor(clicks)) };
}

function parseCategory(value: unknown): Category | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const id = str(value.id);
  const name = str(value.name);
  const color = str(value.color);
  if (id === null || name === null || color === null) return null;
  const items = value.items.map(parseItem);
  if (items.some((item) => item === null)) return null;
  return {
    id,
    name,
    color,
    collapsed: value.collapsed === true,
    showAll: value.showAll === true,
    items: items as Item[],
  };
}

export function parseBoard(value: unknown): Board | null {
  if (!isRecord(value) || !Array.isArray(value.categories)) return null;
  const id = str(value.id);
  const name = str(value.name);
  if (id === null || name === null) return null;
  const categories = value.categories.map(parseCategory);
  if (categories.some((category) => category === null)) return null;
  return { id, name, categories: categories as Category[] };
}

/** Parses persisted or imported JSON, rejecting anything not shaped like app state. */
export function parseState(value: unknown): AppState | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.boards)) return null;
  const boards = value.boards.map(parseBoard);
  if (boards.length === 0 || boards.some((board) => board === null)) return null;
  const valid = boards as Board[];
  const requested = str(value.activeBoardId);
  const activeBoardId = valid.some((board) => board.id === requested) ? requested! : valid[0]!.id;
  return { version: 1, boards: valid, activeBoardId };
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : parseState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Returns false when the browser refused the write (private mode, quota). */
export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
