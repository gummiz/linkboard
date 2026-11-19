import { describe, expect, it } from "vitest";
import { defined } from "./defined";
import { exportBookmarksHtml, importBookmarksHtml } from "./bookmarks";
import { makeBoard, makeCategory, makeItem, sampleState } from "./model";
import { searchItems } from "./search";
import { parseState } from "./storage";

const chromeExport = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://news.ycombinator.com/" ADD_DATE="1">Hacker News</A>
        <DT><H3>Dev</H3>
        <DL><p>
            <DT><A HREF="https://developer.mozilla.org/">MDN</A>
            <DD>Web reference
            <DT><A HREF="javascript:void(0)">Bookmarklet</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://example.com/">Loose link</A>
</DL><p>`;

describe("importBookmarksHtml", () => {
  it("turns top folders into boards and the rest of the path into categories", () => {
    const result = importBookmarksHtml(chromeExport, "Chrome");
    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(1);
    const summary = result.boards.map((board) => [
      board.name,
      board.categories.map((category) => [
        category.name,
        category.items.map((item) => `${item.name}|${item.url}|${item.note}`),
      ]),
    ]);
    expect(summary).toEqual([
      [
        "Bookmarks bar",
        [
          ["General", ["Hacker News|https://news.ycombinator.com/|"]],
          ["Dev", ["MDN|https://developer.mozilla.org/|Web reference"]],
        ],
      ],
      ["Chrome", [["Unsorted", ["Loose link|https://example.com/|"]]]],
    ]);
  });

  it("skips a lone wrapper folder so its subfolders become boards", () => {
    const html = `<DL><p>
    <DT><H3>Papaly</H3>
    <DL><p>
        <DT><H3>AI Dev</H3>
        <DL><p>
            <DT><H3>Tools</H3>
            <DL><p><DT><A HREF="https://a.example/">A</A></DL><p>
        </DL><p>
        <DT><H3>Main</H3>
        <DL><p><DT><A HREF="https://b.example/">B</A></DL><p>
    </DL><p>
</DL><p>`;
    const boards = importBookmarksHtml(html, "File").boards;
    expect(boards.map((board) => [board.name, board.categories.map((category) => category.name)])).toEqual([
      ["AI Dev", ["Tools"]],
      ["Main", ["General"]],
    ]);
  });

  it("keeps a wrapper folder that holds links of its own", () => {
    const html = `<DL><p>
    <DT><H3>Papaly</H3>
    <DL><p>
        <DT><A HREF="https://x.example/">X</A>
        <DT><H3>AI Dev</H3>
        <DL><p>
            <DT><H3>Tools</H3>
            <DL><p><DT><A HREF="https://y.example/">Y</A></DL><p>
        </DL><p>
    </DL><p>
</DL><p>`;
    const boards = importBookmarksHtml(html, "File").boards;
    expect(boards.map((board) => [board.name, board.categories.map((category) => category.name)])).toEqual([
      ["Papaly", ["General", "AI Dev / Tools"]],
    ]);
  });

  it("unwraps one level only", () => {
    const html = `<DL><p>
    <DT><H3>A</H3>
    <DL><p>
        <DT><H3>B</H3>
        <DL><p>
            <DT><H3>C</H3>
            <DL><p>
                <DT><H3>D</H3>
                <DL><p><DT><A HREF="https://d.example/">D</A></DL><p>
            </DL><p>
        </DL><p>
    </DL><p>
</DL><p>`;
    const boards = importBookmarksHtml(html, "File").boards;
    expect(boards.map((board) => [board.name, board.categories.map((category) => category.name)])).toEqual([
      ["B", ["C / D"]],
    ]);
  });

  it("round-trips a single board with several categories", () => {
    const board = makeBoard("Mine", [
      makeCategory("One", "#000", [makeItem("A", "https://a.example/")]),
      makeCategory("Two", "#000", [makeItem("B", "https://b.example/")]),
    ]);
    const boards = importBookmarksHtml(exportBookmarksHtml([board]), "Again").boards;
    expect(boards.map((b) => [b.name, b.categories.map((category) => category.name)])).toEqual([
      ["Mine", ["One", "Two"]],
    ]);
  });

  it("round-trips its own export", () => {
    const board = makeBoard("Mine", [
      makeCategory("A & B", "#000", [makeItem('Quote "x" <y>', "https://a.example/?q=1&r=2", "note")]),
    ]);
    const reimported = importBookmarksHtml(exportBookmarksHtml([board]), "Again").boards;
    expect(reimported).toHaveLength(1);
    expect(defined(reimported[0]).name).toBe("Mine");
    expect(defined(defined(reimported[0]).categories[0]).name).toBe("A & B");
    expect(defined(defined(reimported[0]).categories[0]).items[0]).toMatchObject({
      name: 'Quote "x" <y>',
      url: "https://a.example/?q=1&r=2",
      note: "note",
    });
  });
});

describe("parseState", () => {
  it("accepts saved state and repairs a dangling active board", () => {
    const state = sampleState();
    const restored = parseState(JSON.parse(JSON.stringify({ ...state, activeBoardId: "gone" })));
    expect(restored?.boards).toEqual(state.boards);
    expect(restored?.activeBoardId).toBe(defined(state.boards[0]).id);
  });

  it.each([null, [], { version: 2, boards: [] }, { version: 1, boards: [] }, { version: 1, boards: [{ id: 1 }] }])(
    "rejects %j",
    (value) => { expect(parseState(value)).toBeNull(); },
  );
});

describe("searchItems", () => {
  it("matches every term across boards and ranks name matches first", () => {
    const state = sampleState();
    const hits = searchItems(state, "mdn");
    expect(hits.map((hit) => hit.item.name)).toEqual(["MDN Web Docs"]);
    expect(searchItems(state, "news bbc").map((hit) => hit.item.name)).toEqual(["BBC News"]);
    expect(searchItems(state, "   ")).toEqual([]);
  });
});
