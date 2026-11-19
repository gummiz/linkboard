import { sampleState, type AppState, type RevisionedState } from "./model";
import { parseState } from "./storage";
import { reducer, type Action } from "./store";

const STATE_API_URL = "/api/state";
const SERVER_FETCH_TIMEOUT_MS = 5000;

export type SaveResult =
  | { kind: "saved"; revision: number }
  | ({ kind: "conflict" } & RevisionedState)
  | { kind: "unreachable" };

export type FirstContact =
  | { kind: "use-file"; state: AppState }
  | { kind: "upload"; state: AppState }
  | { kind: "conflict"; file: AppState; browser: AppState };

function isValidRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Returns null only when there is no server to talk to (network error, or a non-JSON answer such as the Vite dev server's index.html).
 * Throws when a server is there but misbehaves: timeout, non-2xx from a JSON server, or JSON of the wrong shape.
 */
export async function fetchServerState(): Promise<RevisionedState<AppState | null> | null> {
  let response: Response;
  try {
    response = await fetch(STATE_API_URL, { signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`Server did not answer within ${SERVER_FETCH_TIMEOUT_MS} ms`);
    }
    return null;
  }
  // The Vite dev server answers unknown paths with 200 text/html.
  if (!response.headers.get("content-type")?.includes("application/json")) return null;
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" ? message : `GET ${STATE_API_URL} failed with status ${response.status}`);
  }
  if (typeof body !== "object" || body === null) throw new Error("Server state response is not an object");
  const { revision, state } = body as { revision?: unknown; state?: unknown };
  if (!isValidRevision(revision)) throw new Error("Server state response has an invalid revision");
  if (state === null) return { revision, state: null };
  const parsedState = parseState(state);
  if (parsedState === null) throw new Error("Server state response has an invalid state");
  return { revision, state: parsedState };
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

/** The reducer returns the same state object when an action's target is gone; such an edit is lost. */
export function replayPending(
  fileState: AppState,
  pending: readonly Action[],
): { state: AppState; lostActionCount: number } {
  let state = fileState;
  let lostActionCount = 0;
  for (const action of pending) {
    const next = reducer(state, action);
    if (next === state) lostActionCount++;
    state = next;
  }
  return { state, lostActionCount };
}

/** Takes the incoming state but keeps the local active board if it still exists there. */
export function adoptState(incoming: AppState, localActiveBoardId: string): AppState {
  const localBoardStillExists = incoming.boards.some((board) => board.id === localActiveBoardId);
  return localBoardStillExists ? { ...incoming, activeBoardId: localActiveBoardId } : incoming;
}
