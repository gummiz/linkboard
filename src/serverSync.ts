import { sampleState, type AppState } from "./model";
import { parseState } from "./storage";
import { reducer, type Action } from "./store";

const STATE_API_URL = "/api/state";

export type ServerSnapshot = { revision: number; state: AppState | null };

export type SaveResult =
  | { kind: "saved"; revision: number }
  | { kind: "conflict"; revision: number; state: AppState }
  | { kind: "unreachable" };

export type FirstContact =
  | { kind: "use-file"; state: AppState }
  | { kind: "upload"; state: AppState }
  | { kind: "conflict"; file: AppState; browser: AppState };

function isValidRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export type ServerError = { error: string };

/**
 * Returns null whenever server mode is unavailable (network error, non-JSON, other non-2xx, wrong shape).
 * A JSON 5xx means the server is there but cannot serve the data (e.g. corrupt file): returned as ServerError.
 */
export async function fetchServerState(): Promise<ServerSnapshot | ServerError | null> {
  try {
    const response = await fetch(STATE_API_URL);
    // The Vite dev server answers unknown paths with 200 text/html.
    if (!response.headers.get("content-type")?.includes("application/json")) return null;
    const body: unknown = await response.json();
    if (response.status >= 500) {
      const message = (body as { error?: unknown } | null)?.error;
      return { error: typeof message === "string" ? message : `HTTP ${response.status}` };
    }
    if (!response.ok) return null;
    if (typeof body !== "object" || body === null) return null;
    const { revision, state } = body as { revision?: unknown; state?: unknown };
    if (!isValidRevision(revision)) return null;
    if (state === null) return { revision, state: null };
    const parsedState = parseState(state);
    return parsedState === null ? null : { revision, state: parsedState };
  } catch {
    return null;
  }
}

/** Network failure is "unreachable"; any unexpected status throws (client bug, fail loud). */
export async function putServerState(baseRevision: number, state: AppState): Promise<SaveResult> {
  let response: Response;
  try {
    response = await fetch(STATE_API_URL, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRevision, state }),
    });
  } catch {
    return { kind: "unreachable" };
  }
  if (response.status === 200) {
    const body = (await response.json()) as { revision: number };
    return { kind: "saved", revision: body.revision };
  }
  if (response.status === 409) {
    const body = (await response.json()) as { revision: number; state: unknown };
    const serverState = parseState(body.state);
    if (serverState === null) throw new Error("Server returned 409 with an invalid state");
    return { kind: "conflict", revision: body.revision, state: serverState };
  }
  throw new Error(`PUT ${STATE_API_URL} failed with status ${response.status}`);
}

export function boardsEqual(a: AppState, b: AppState): boolean {
  return JSON.stringify(a.boards) === JSON.stringify(b.boards);
}

export function decideFirstContact(file: AppState | null, browser: AppState | null): FirstContact {
  if (file === null) return { kind: "upload", state: browser ?? sampleState() };
  if (browser === null || boardsEqual(file, browser)) return { kind: "use-file", state: file };
  return { kind: "conflict", file, browser };
}

export function replayPending(fileState: AppState, pending: readonly Action[]): AppState {
  return pending.reduce(reducer, fileState);
}

/** Takes the incoming state but keeps the local active board if it still exists there. */
export function adoptState(incoming: AppState, localActiveBoardId: string): AppState {
  const localBoardStillExists = incoming.boards.some((board) => board.id === localActiveBoardId);
  return localBoardStillExists ? { ...incoming, activeBoardId: localActiveBoardId } : incoming;
}
