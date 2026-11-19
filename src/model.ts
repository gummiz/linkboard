export interface Item {
  id: string;
  name: string;
  url: string;
  note: string;
  clicks: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  showAll: boolean;
  items: Item[];
}

export interface Board {
  id: string;
  name: string;
  categories: Category[];
}

export interface AppState {
  version: 1;
  boards: Board[];
  activeBoardId: string;
}

/** Categories show this many links before collapsing the rest behind "+N more". */
export const VISIBLE_ITEM_LIMIT = 6;

export const CATEGORY_COLORS = [
  "#f97316",
  "#0ea5e9",
  "#ef4444",
  "#8b5cf6",
  "#10b981",
  "#eab308",
  "#ec4899",
  "#475569",
] as const;

export function newId(): string {
  return crypto.randomUUID();
}

export function makeItem(name: string, url: string, note = ""): Item {
  return { id: newId(), name, url, note, clicks: 0 };
}

export function makeCategory(name: string, color: string, items: Item[] = []): Category {
  return { id: newId(), name, color, collapsed: false, showAll: false, items };
}

export function makeBoard(name: string, categories: Category[] = []): Board {
  return { id: newId(), name, categories };
}

/**
 * Normalizes user-typed link input into an absolute http(s) URL, or returns
 * null when the input cannot be a web link.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.href;
  } catch {
    return null;
  }
}

/** A readable default name for a link when the user gives none. */
export function nameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Ids of the most-clicked items in a category, shown with a "hot" marker. */
export function hotItemIds(category: Category, minClicks = 3, max = 3): Set<string> {
  return new Set(
    category.items
      .filter((item) => item.clicks >= minClicks)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, max)
      .map((item) => item.id),
  );
}

/** A state together with the server file revision it belongs to; `state` is null while the file does not exist yet. */
export type RevisionedState<State extends AppState | null = AppState> = { revision: number; state: State };

export function sampleState(): AppState {
  const board = makeBoard("My First Board", [
    makeCategory("Getting started", CATEGORY_COLORS[1], [
      makeItem("Drag links between categories", "https://developer.mozilla.org/docs/Web/API/HTML_Drag_and_Drop_API"),
      makeItem("Press / to search every board", "https://developer.mozilla.org/"),
    ]),
    makeCategory("News", CATEGORY_COLORS[0], [
      makeItem("Hacker News", "https://news.ycombinator.com/"),
      makeItem("BBC News", "https://www.bbc.com/news"),
      makeItem("Reuters", "https://www.reuters.com/"),
    ]),
    makeCategory("Reference", CATEGORY_COLORS[3], [
      makeItem("Wikipedia", "https://www.wikipedia.org/"),
      makeItem("MDN Web Docs", "https://developer.mozilla.org/"),
    ]),
    makeCategory("Tools", CATEGORY_COLORS[4], [
      makeItem("GitHub", "https://github.com/"),
      makeItem("Google Maps", "https://maps.google.com/"),
    ]),
  ]);
  return { version: 1, boards: [board], activeBoardId: board.id };
}
