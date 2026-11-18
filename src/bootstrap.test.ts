import { describe, expect, it, vi } from "vitest";
import { loadInitialState } from "./bootstrap";
import { fetchServerState } from "./serverSync";

vi.mock("./serverSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./serverSync")>()),
  fetchServerState: vi.fn(),
}));

describe("loadInitialState", () => {
  it("runs in local mode with a notice when the server reports a data error", async () => {
    vi.mocked(fetchServerState).mockResolvedValue({ error: "data file is corrupt" });
    const result = await loadInitialState();
    expect(result.mode).toBe("local");
    expect(result).toMatchObject({ notice: "Not saved: server error (data file is corrupt)" });
  });
});
