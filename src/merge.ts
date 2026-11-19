import { newId, normalizeUrl, type AppState, type Board, type Category, type Item } from "./model";

const nameKey = (name: string) => name.trim().toLowerCase();
const urlKey = (url: string) => normalizeUrl(url) ?? url;

/**
 * Merges the browser's boards into the file state. The file is the base; boards
 * and categories match by trimmed, case-insensitive name; links match by
 * normalized URL across the whole file. Inputs are not mutated.
 */
export function mergeStates(
  file: AppState,
  browser: AppState,
): { state: AppState; added: number; skipped: number } {
  const state = structuredClone(file);
  const knownUrls = new Set<string>();
  for (const board of state.boards) {
    for (const category of board.categories) {
      for (const item of category.items) knownUrls.add(urlKey(item.url));
    }
  }
  let added = 0;
  let skipped = 0;

  // Appends browser items whose URL is new (with fresh ids); returns how many were added.
  function appendNewItems(targetItems: Item[], browserItems: Item[]): number {
    let addedHere = 0;
    for (const item of browserItems) {
      const key = urlKey(item.url);
      if (knownUrls.has(key)) {
        skipped++;
        continue;
      }
      knownUrls.add(key);
      targetItems.push({ ...item, id: newId() });
      addedHere++;
    }
    added += addedHere;
    return addedHere;
  }

  function mergeCategories(targetCategories: Category[], browserCategories: Category[]): void {
    for (const browserCategory of browserCategories) {
      const match = targetCategories.find((category) => nameKey(category.name) === nameKey(browserCategory.name));
      if (match) {
        appendNewItems(match.items, browserCategory.items);
        continue;
      }
      const appended: Category = { ...browserCategory, id: newId(), items: [] };
      const addedHere = appendNewItems(appended.items, browserCategory.items);
      // An empty category is user data; a fully duplicate one is not.
      if (addedHere > 0 || browserCategory.items.length === 0) targetCategories.push(appended);
    }
  }

  for (const browserBoard of browser.boards) {
    const match = state.boards.find((board) => nameKey(board.name) === nameKey(browserBoard.name));
    if (match) {
      mergeCategories(match.categories, browserBoard.categories);
      continue;
    }
    const appended: Board = { id: newId(), name: browserBoard.name, categories: [] };
    mergeCategories(appended.categories, browserBoard.categories);
    if (appended.categories.length > 0 || browserBoard.categories.length === 0) state.boards.push(appended);
  }

  state.activeBoardId = file.activeBoardId;
  return { state, added, skipped };
}
