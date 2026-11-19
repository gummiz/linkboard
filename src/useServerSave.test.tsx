import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defined } from "./defined";
import { makeBoard, type AppState } from "./model";
import { fetchServerState, putServerState } from "./serverSync";
import type { Action } from "./store";
import { useServerSave } from "./useServerSave";

vi.mock("./serverSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./serverSync")>()),
  putServerState: vi.fn(),
  fetchServerState: vi.fn(),
}));

const putServerStateMock = vi.mocked(putServerState);

const board = makeBoard("Original");
const localState: AppState = { version: 1, boards: [board], activeBoardId: board.id };
const fileState: AppState = { ...localState, boards: [{ ...board, name: "From file" }] };
const renameAction: Action = { type: "board/update", boardId: board.id, patch: { name: "Renamed" } };
const renamedState: AppState = { ...localState, boards: [{ ...board, name: "Renamed" }] };

function setup() {
  const replaceState = vi.fn();
  const notify = vi.fn();
  const hook = renderHook(
    ({ state }) => useServerSave({ enabled: true, initialRevision: 3, state, replaceState, notify }),
    { initialProps: { state: localState } },
  );
  // Same as App: the action is tracked together with the dispatch that changes the state.
  act(() => { hook.result.current.track(renameAction); });
  hook.rerender({ state: renamedState });
  return { hook, replaceState, notify };
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  putServerStateMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useServerSave", () => {
  it("sends one PUT after 300 ms with the known revision", async () => {
    putServerStateMock.mockResolvedValue({ kind: "saved", revision: 4 });
    setup();

    await advance(299);
    expect(putServerStateMock).not.toHaveBeenCalled();
    await advance(1);
    expect(putServerStateMock).toHaveBeenCalledTimes(1);
    expect(putServerStateMock).toHaveBeenCalledWith(3, renamedState);
  });

  it("replays the pending action on the file state after a first conflict, then saves with the new revision", async () => {
    putServerStateMock
      .mockResolvedValueOnce({ kind: "conflict", revision: 7, state: fileState })
      .mockResolvedValueOnce({ kind: "saved", revision: 8 });
    const { hook, replaceState } = setup();
    await advance(300);

    expect(replaceState).toHaveBeenCalledTimes(1);
    const replayedState = defined(replaceState.mock.calls[0])[0] as AppState;
    expect(defined(replayedState.boards[0]).name).toBe("Renamed");

    hook.rerender({ state: replayedState });
    await advance(300);
    expect(putServerStateMock).toHaveBeenCalledTimes(2);
    expect(putServerStateMock).toHaveBeenLastCalledWith(7, replayedState);
  });

  it("notifies when a replayed action's target is gone in the file state", async () => {
    const fileWithoutBoard: AppState = { ...fileState, boards: [makeBoard("Other")] };
    fileWithoutBoard.activeBoardId = defined(fileWithoutBoard.boards[0]).id;
    putServerStateMock.mockResolvedValueOnce({ kind: "conflict", revision: 7, state: fileWithoutBoard });
    const { replaceState, notify } = setup();
    await advance(300);

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Reloaded changes from another window; your last edit was not saved.");
  });

  it("does not notify when the replay applies cleanly", async () => {
    putServerStateMock.mockResolvedValueOnce({ kind: "conflict", revision: 7, state: fileState });
    const { notify } = setup();
    await advance(300);
    expect(notify).not.toHaveBeenCalled();
  });

  it("adopts the file state and notifies after two consecutive conflicts", async () => {
    putServerStateMock
      .mockResolvedValueOnce({ kind: "conflict", revision: 7, state: fileState })
      .mockResolvedValueOnce({ kind: "conflict", revision: 8, state: fileState });
    const { hook, replaceState, notify } = setup();
    await advance(300);
    hook.rerender({ state: defined(replaceState.mock.calls[0])[0] as AppState });
    await advance(300);

    expect(replaceState).toHaveBeenCalledTimes(2);
    expect(replaceState).toHaveBeenLastCalledWith(fileState);
    expect(notify).toHaveBeenCalledWith("Reloaded changes from another window; your last edit was not saved.");
  });

  it("notifies when the server is unreachable and re-sends the pending action on the next change", async () => {
    putServerStateMock
      .mockResolvedValueOnce({ kind: "unreachable" })
      .mockResolvedValueOnce({ kind: "saved", revision: 4 });
    const { hook, notify } = setup();
    await advance(300);
    expect(notify).toHaveBeenCalledWith("Not saved: server unreachable");

    const laterState = { ...localState, boards: [{ ...board, name: "Renamed again" }] };
    hook.rerender({ state: laterState });
    await advance(300);
    expect(putServerStateMock).toHaveBeenCalledTimes(2);
    expect(putServerStateMock).toHaveBeenLastCalledWith(3, laterState);
  });

  it("notifies with the error message when the PUT throws and keeps the pending action", async () => {
    putServerStateMock
      .mockRejectedValueOnce(new Error("PUT /api/state failed with status 500"))
      .mockResolvedValueOnce({ kind: "saved", revision: 4 });
    const { hook, notify } = setup();
    await advance(300);
    expect(notify).toHaveBeenCalledWith("Not saved: PUT /api/state failed with status 500");

    hook.rerender({ state: { ...renamedState } });
    await advance(300);
    expect(putServerStateMock).toHaveBeenCalledTimes(2);
  });
});

describe("useServerSave focus refresh", () => {
  it("notifies when the server reports a data error", async () => {
    vi.mocked(fetchServerState).mockRejectedValue(new Error("data file is corrupt"));
    const notify = vi.fn();
    renderHook(() =>
      useServerSave({ enabled: true, initialRevision: 3, state: localState, replaceState: vi.fn(), notify }),
    );

    await act(() => {
      window.dispatchEvent(new Event("focus"));
      return Promise.resolve();
    });
    expect(notify).toHaveBeenCalledWith("Not saved: server error (data file is corrupt)");
  });
});
