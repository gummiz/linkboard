import { sampleState, type AppState } from "./model";
import { adoptState, decideFirstContact, fetchServerState, putServerState, type SaveResult } from "./serverSync";
import { loadState } from "./storage";

export type InitialLoad =
  | { mode: "local"; state: AppState; notice?: string }
  | {
      mode: "server";
      revision: number;
      state: AppState;
      conflict?: { file: AppState; browser: AppState };
    };

export async function loadInitialState(): Promise<InitialLoad> {
  const browserState = loadState();
  const snapshot = await fetchServerState();
  if (snapshot === null) return { mode: "local", state: browserState ?? sampleState() };

  // An upload can hit a 409 once; the retry always sees a file with data, so it never uploads again.
  let fileState = snapshot.state;
  let revision = snapshot.revision;
  for (;;) {
    const firstContact = decideFirstContact(fileState, browserState);
    if (firstContact.kind === "use-file") {
      const state = browserState === null ? firstContact.state : adoptState(firstContact.state, browserState.activeBoardId);
      return { mode: "server", revision, state };
    }
    if (firstContact.kind === "conflict") {
      return {
        mode: "server",
        revision,
        state: firstContact.file,
        conflict: { file: firstContact.file, browser: firstContact.browser },
      };
    }
    let result: SaveResult;
    try {
      result = await putServerState(revision, firstContact.state);
    } catch (error) {
      // A server error must not leave the app on "Loading…": run like local mode and say so.
      return { mode: "local", state: firstContact.state, notice: `Not saved: ${(error as Error).message}` };
    }
    if (result.kind === "saved") return { mode: "server", revision: result.revision, state: firstContact.state };
    if (result.kind === "unreachable") {
      return { mode: "local", state: firstContact.state, notice: "Not saved: server unreachable" };
    }
    fileState = result.state;
    revision = result.revision;
  }
}
