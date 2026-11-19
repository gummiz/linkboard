import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { sampleState } from "./model";
import { saveState } from "./storage";

const NOTICE = "This browser is not saving changes (storage is blocked or full).";

function stubLocalStorage() {
  const entries = new Map<string, string>();
  const control = { blocked: false };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (control.blocked) throw new DOMException("Quota exceeded", "QuotaExceededError");
      entries.set(key, value);
    },
  });
  return control;
}

function addBoard(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "+ New board" }));
  fireEvent.change(screen.getByLabelText("New board name"), { target: { value: name } });
  fireEvent.submit(screen.getByLabelText("New board name"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  stubLocalStorage();
  saveState(sampleState());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("storage failure notice", () => {
  it("stays visible while writes fail and disappears after the next successful save", async () => {
    const storage = stubLocalStorage();
    storage.blocked = true;
    render(<App initial={{ mode: "local", state: sampleState() }} />);

    expect(screen.getByRole("status").textContent).toBe(NOTICE);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByRole("status").textContent).toBe(NOTICE);

    addBoard("Second");
    expect(screen.getByRole("status").textContent).toBe(NOTICE);

    storage.blocked = false;
    addBoard("Third");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays hidden in server mode, where the server keeps the changes", () => {
    stubLocalStorage().blocked = true;
    render(<App initial={{ mode: "server", revision: 1, state: sampleState() }} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows no notice when writes succeed", () => {
    stubLocalStorage();
    render(<App initial={{ mode: "local", state: sampleState() }} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
