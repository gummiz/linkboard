import { afterEach, describe, expect, it, vi } from "vitest";
import { defined } from "./defined";
import { makeBoard, makeCategory, makeItem, sampleState, type AppState } from "./model";
import type { Action } from "./store";
import {
  adoptState,
  boardsEqual,
  decideFirstContact,
  fetchServerState,
  putServerState,
  replayPending,
} from "./serverSync";

function stateOf(...boards: ReturnType<typeof makeBoard>[]): AppState {
  return { version: 1, boards, activeBoardId: defined(boards[0]).id };
}

function jsonResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

function mockFetch(implementation: () => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  globalThis.fetch = fetchMock;
  return fetchMock;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchServerState", () => {
  it("returns null when fetch rejects", async () => {
    mockFetch(() => Promise.reject(new TypeError("network down")));
    expect(await fetchServerState()).toBeNull();
  });

  it("returns null when response is HTML", async () => {
    mockFetch(() => Promise.resolve(jsonResponse("<html></html>", 200, "text/html")));
    expect(await fetchServerState()).toBeNull();
  });

  it("returns null on a 500 with HTML", async () => {
    mockFetch(() => Promise.resolve(jsonResponse("<html>oops</html>", 500, "text/html")));
    expect(await fetchServerState()).toBeNull();
  });

  it("throws the server's message on a JSON 500", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ error: "data file is corrupt" }, 500)));
    await expect(fetchServerState()).rejects.toThrow("data file is corrupt");
  });

  it("throws with the status on a JSON non-2xx without message", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ revision: 0, state: null }, 404)));
    await expect(fetchServerState()).rejects.toThrow("status 404");
  });

  it("throws on wrong shape", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ revision: -1, state: null })));
    await expect(fetchServerState()).rejects.toThrow("invalid revision");
    mockFetch(() => Promise.resolve(jsonResponse({ revision: 1, state: { nope: true } })));
    await expect(fetchServerState()).rejects.toThrow("invalid state");
  });

  it("throws on timeout", async () => {
    mockFetch(() => Promise.reject(new DOMException("timed out", "TimeoutError")));
    await expect(fetchServerState()).rejects.toThrow("did not answer");
  });

  it("returns snapshot on valid JSON", async () => {
    const state = sampleState();
    const fetchMock = mockFetch(() => Promise.resolve(jsonResponse({ revision: 3, state })));
    expect(await fetchServerState()).toEqual({ revision: 3, state });
    const anyAbortSignal: unknown = expect.any(AbortSignal);
    expect(fetchMock).toHaveBeenCalledWith("/api/state", { signal: anyAbortSignal });
  });

  it("returns snapshot with null state for an empty server", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ revision: 0, state: null })));
    expect(await fetchServerState()).toEqual({ revision: 0, state: null });
  });
});

describe("putServerState", () => {
  const state = sampleState();

  it("maps 200 to saved", async () => {
    const fetchMock = mockFetch(() => Promise.resolve(jsonResponse({ revision: 5 })));
    expect(await putServerState(4, state)).toEqual({ kind: "saved", revision: 5 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/state");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ baseRevision: 4, state });
  });

  it("maps 409 to conflict", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ revision: 7, state }, 409)));
    expect(await putServerState(4, state)).toEqual({ kind: "conflict", revision: 7, state });
  });

  it("maps network error to unreachable", async () => {
    mockFetch(() => Promise.reject(new TypeError("network down")));
    expect(await putServerState(4, state)).toEqual({ kind: "unreachable" });
  });

  it("throws on 400", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({}, 400)));
    await expect(putServerState(4, state)).rejects.toThrow("400");
  });

  it("throws on a 409 with an invalid state", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ revision: 7, state: { nope: true } }, 409)));
    await expect(putServerState(4, state)).rejects.toThrow();
  });
});

describe("decideFirstContact", () => {
  const fileState = stateOf(makeBoard("File", [makeCategory("A", "#000", [makeItem("a", "https://a.example/")])]));
  const browserState = stateOf(makeBoard("Browser", [makeCategory("B", "#111", [makeItem("b", "https://b.example/")])]));

  it("uploads sample state when neither has data", () => {
    const decision = decideFirstContact(null, null);
    expect(decision.kind).toBe("upload");
    if (decision.kind === "upload") expect(decision.state.boards.length).toBeGreaterThan(0);
  });

  it("uploads browser state when file is empty", () => {
    expect(decideFirstContact(null, browserState)).toEqual({ kind: "upload", state: browserState });
  });

  it("uses file when browser has nothing (unparseable browser data counts as none)", () => {
    expect(decideFirstContact(fileState, null)).toEqual({ kind: "use-file", state: fileState });
  });

  it("uses file when both are identical except activeBoardId", () => {
    const twoBoards = stateOf(makeBoard("One"), makeBoard("Two"));
    const other = { ...twoBoards, activeBoardId: defined(twoBoards.boards[1]).id };
    expect(boardsEqual(twoBoards, other)).toBe(true);
    expect(decideFirstContact(twoBoards, other)).toEqual({ kind: "use-file", state: twoBoards });
  });

  it("reports a conflict when both differ", () => {
    expect(decideFirstContact(fileState, browserState)).toEqual({
      kind: "conflict",
      file: fileState,
      browser: browserState,
    });
  });
});

describe("replayPending", () => {
  it("applies item/add on top of a newer file state", () => {
    const board = makeBoard("Work", [makeCategory("A", "#000")]);
    const fileState = stateOf(board);
    const item = makeItem("new", "https://new.example/");
    const pending: Action[] = [
      { type: "item/add", boardId: board.id, categoryId: defined(board.categories[0]).id, item },
    ];
    const result = replayPending(fileState, pending);
    expect(defined(defined(result.state.boards[0]).categories[0]).items).toEqual([item]);
    expect(result.lostActionCount).toBe(0);
  });

  it("counts an action whose category is gone in the file state as lost", () => {
    const board = makeBoard("Work", [makeCategory("A", "#000")]);
    const fileState = stateOf(board);
    const pending: Action[] = [
      { type: "item/add", boardId: board.id, categoryId: "deleted", item: makeItem("new", "https://new.example/") },
    ];
    const result = replayPending(fileState, pending);
    expect(result.state).toBe(fileState);
    expect(result.lostActionCount).toBe(1);
  });
});

describe("adoptState", () => {
  const incoming = stateOf(makeBoard("One"), makeBoard("Two"));

  it("keeps a valid local active board", () => {
    const localId = defined(incoming.boards[1]).id;
    expect(adoptState(incoming, localId).activeBoardId).toBe(localId);
  });

  it("falls back to incoming when local board is gone", () => {
    expect(adoptState(incoming, "gone").activeBoardId).toBe(incoming.activeBoardId);
  });
});
