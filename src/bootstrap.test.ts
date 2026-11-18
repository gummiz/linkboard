import { describe, expect, it, vi } from "vitest";
import { loadInitialState } from "./bootstrap";
import { fetchServerState } from "./serverSync";

vi.mock("./serverSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./serverSync")>()),
  fetchServerState: vi.fn(),
}));

describe("loadInitialState", () => {
  it("lets a server error propagate instead of falling back to local mode", async () => {
    vi.mocked(fetchServerState).mockRejectedValue(new Error("data file is corrupt"));
    await expect(loadInitialState()).rejects.toThrow("data file is corrupt");
  });
});
