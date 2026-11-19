import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportBookmarksHtml, importBookmarksHtml } from "./bookmarks";
import { CATEGORY_COLORS, type Board } from "./model";

// Not `new URL(..., import.meta.url)`: Vite rewrites that literal into an asset URL ("/src/fixtures/...")
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", `${name}.html`), "utf8");

/** [boardName, [categoryName, itemNames[]][]][] */
function summarizeBoards(boards: Board[]) {
  return boards.map((board) => [
    board.name,
    board.categories.map((category) => [category.name, category.items.map((item) => item.name)]),
  ]);
}

/** Every item as "url|note", in board/category order. */
const itemDetails = (boards: Board[]) =>
  boards.flatMap((board) => board.categories.flatMap((category) => category.items.map((item) => `${item.url}|${item.note}`)));

describe("chrome fixture", () => {
  const result = importBookmarksHtml(fixture("chrome"), "Chrome");

  it("turns bookmarks bar and other bookmarks into boards", () => {
    expect(summarizeBoards(result.boards)).toEqual([
      [
        "Bookmarks bar",
        [
          ["General", ["GitHub"]],
          ["Dev", ["MDN Web Docs"]],
          ["Dev / Frameworks", ["React", "Vite"]],
          ["News", ["Hacker News"]],
        ],
      ],
      [
        "Other bookmarks",
        [
          ["General", ["Wikipedia"]],
          ["Recipes", ["Pancakes"]],
        ],
      ],
    ]);
    expect(result.imported).toBe(7);
    expect(result.skipped).toBe(1);
  });

  it("does not unwrap: two top folders are two boards", () => {
    expect(result.boards.map((board) => board.name)).toEqual(["Bookmarks bar", "Other bookmarks"]);
  });

  it("rotates category colors in order", () => {
    expect(result.boards[0]!.categories.map((category) => category.color)).toEqual(CATEGORY_COLORS.slice(0, 4));
    expect(result.boards[1]!.categories.map((category) => category.color)).toEqual(CATEGORY_COLORS.slice(0, 2));
  });
});

describe("firefox fixture", () => {
  const result = importBookmarksHtml(fixture("firefox"), "Firefox");

  it("puts menu links in the fallback board and keeps toolbar and Other Bookmarks as boards", () => {
    expect(summarizeBoards(result.boards)).toEqual([
      ["Firefox", [["Unsorted", ["Get Firefox", "DuckDuckGo search"]]]],
      [
        "Bookmarks Toolbar",
        [
          ["General", ["GitHub"]],
          ["Reading", ["Bookmark (digital)", "MDN"]],
        ],
      ],
      ["Other Bookmarks", [["General", ["Misc"]]]],
    ]);
    expect(result.imported).toBe(6);
    expect(result.skipped).toBe(1);
  });

  it("skips the place: smart bookmark", () => {
    expect(itemDetails(result.boards).some((detail) => detail.startsWith("place:"))).toBe(false);
  });

  it("reads DD notes", () => {
    expect(itemDetails(result.boards)).toContain("https://www.mozilla.org/firefox/|The browser itself");
  });

});

describe("safari fixture", () => {
  const result = importBookmarksHtml(fixture("safari"), "Safari");

  it("maps Favorites, Bookmarks Menu and Reading List to boards", () => {
    expect(summarizeBoards(result.boards)).toEqual([
      ["Favorites", [["General", ["Apple", "Wikipedia"]]]],
      [
        "Bookmarks Menu",
        [
          ["General", ["Apple Developer Documentation"]],
          ["Design", ["Human Interface Guidelines"]],
        ],
      ],
      ["Reading List", [["General", ["A long read", "A short read", "Weeknight recipe"]]]],
    ]);
    expect(result.imported).toBe(7);
    expect(result.skipped).toBe(0);
  });

  it("keeps Reading List notes only on the links that have one", () => {
    const reading = result.boards[2]!.categories[0]!.items.map((item) => item.note);
    expect(reading).toEqual(["Finish over the weekend", "", "Needs fresh basil"]);
  });
});

describe("papaly fixture", () => {
  const result = importBookmarksHtml(fixture("papaly"), "Papaly file");

  it("skips the Papaly wrapper so its folders become boards", () => {
    expect(summarizeBoards(result.boards)).toEqual([
      [
        "Main",
        [
          ["General", ["Mail"]],
          ["Daily", ["Calendar", "Tasks"]],
        ],
      ],
      [
        "AI Dev",
        [
          ["Tools", ["Copilot", "Ollama"]],
          ["Docs", ["Anthropic Docs"]],
        ],
      ],
      [
        "Web Dev",
        [
          ["CSS", ["MDN CSS", "CSS-Tricks"]],
          ["JavaScript", ["MDN JavaScript"]],
        ],
      ],
      [
        "AI",
        [
          ["Chat", ["Claude"]],
          ["Image", ["Hugging Face"]],
        ],
      ],
      [
        "Main News",
        [
          ["World", ["BBC News"]],
          ["Tech", ["Hacker News"]],
        ],
      ],
    ]);
    expect(result.imported).toBe(13);
    expect(result.skipped).toBe(0);
  });

  it("has no board named after the wrapper", () => {
    expect(result.boards.map((board) => board.name)).not.toContain("Papaly");
  });

  it("keeps boards that only have categories without a General category", () => {
    const ai = result.boards.find((board) => board.name === "AI")!;
    expect(ai.categories.map((category) => category.name)).toEqual(["Chat", "Image"]);
  });

  it("reads DD notes", () => {
    expect(itemDetails(result.boards)).toContain("https://calendar.example.com/|Team calendar");
    expect(itemDetails(result.boards)).toContain("https://docs.anthropic.com/|API reference");
  });
});

describe("edge-cases fixture", () => {
  const result = importBookmarksHtml(fixture("edge-cases"), "Edge");
  const board = (name: string) => result.boards.find((b) => b.name === name);

  it("imports the expected boards", () => {
    expect(summarizeBoards(result.boards)).toEqual([
      ["Edge", [["Unsorted", ["Loose one", "Loose two"]]]],
      ["Folder", [["General", ["In unnamed folder"]]]],
      ["Übersicht & Größe 🍰", [["General", ["Café & Crème 🍰"]]]],
      [
        "Ops / Infra",
        [
          ["General", ["Ops home"]],
          ["A / B", ["Nested B", "Slash folder"]],
        ],
      ],
      [
        "Duplicate",
        [
          ["General", ["First", "Second"]],
          ["Sub", ["Third"]],
        ],
      ],
      ["Level 1", [["Level 2 / Level 3 / Level 4 / Level 5", ["Deep link"]]]],
      ["Odd links", [["General", ["https://notext.example.com/", "No protocol"]]]],
    ]);
    expect(result.imported).toBe(13);
    expect(result.skipped).toBe(2);
  });

  it("creates no board for an empty folder", () => {
    expect(board("Empty folder")).toBeUndefined();
  });

  it("names a folder with an empty heading 'Folder'", () => {
    expect(board("Folder")).toBeDefined();
  });

  it("decodes entities in names, URLs and notes", () => {
    const item = board("Übersicht & Größe 🍰")!.categories[0]!.items[0]!;
    expect(item.name).toBe("Café & Crème 🍰");
    expect(item.url).toBe("https://example.com/cafe?a=1&b=2");
    expect(item.note).toBe("Ünïcode & <tags>");
  });

  it("falls back to the URL when a link has no text", () => {
    expect(board("Odd links")!.categories[0]!.items[0]!.name).toBe("https://notext.example.com/");
  });

  it("adds https:// to a URL without protocol", () => {
    expect(board("Odd links")!.categories[0]!.items[1]!.url).toBe("https://example.org/no-protocol");
  });

  it("skips about: and file: links", () => {
    expect(itemDetails(result.boards).some((detail) => /^(about|file):/.test(detail))).toBe(false);
  });

  it("merges top folders with the same name into one board", () => {
    expect(result.boards.filter((b) => b.name === "Duplicate")).toHaveLength(1);
  });

  it("merges a folder path 'A / B' with the nested path A > B into one category", () => {
    const categories = board("Ops / Infra")!.categories.map((category) => category.name);
    expect(categories.filter((name) => name === "A / B")).toHaveLength(1);
  });
});

describe("category colors", () => {
  it("wraps around after the last color", () => {
    const count = CATEGORY_COLORS.length + 1;
    const folders = Array.from({ length: count }, (_, i) => `<DT><H3>C${i}</H3><DL><p><DT><A HREF="https://c${i}.example.com/">L</A></DL><p>`);
    const html = `<DL><p><DT><H3>Board</H3><DL><p>${folders.join("")}</DL><p></DL><p>`;
    const colors = importBookmarksHtml(html, "File").boards[0]!.categories.map((category) => category.color);
    expect(colors).toHaveLength(count);
    expect(colors.at(-1)).toBe(CATEGORY_COLORS[0]);
  });
});

describe("round trip through exportBookmarksHtml", () => {
  it.each([
    ["chrome", "Chrome"],
    ["firefox", "Firefox"],
    ["safari", "Safari"],
    ["papaly", "Papaly file"],
  ])("keeps boards, categories, items and notes for %s", (name, fallback) => {
    const first = importBookmarksHtml(fixture(name), fallback).boards;
    const second = importBookmarksHtml(exportBookmarksHtml(first), fallback).boards;
    expect(summarizeBoards(second)).toEqual(summarizeBoards(first));
    expect(itemDetails(second)).toEqual(itemDetails(first));
  });
});
