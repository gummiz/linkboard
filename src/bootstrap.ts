import { sampleState, type AppState } from "./model";
import { decideFirstContact, adoptState, fetchServerState, putServerState } from "./serverSync";
import { loadState } from "./storage";

export type InitialLoad =
  | { mode: "local"; state: AppState }
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
    const result = await putServerState(revision, firstContact.state);
    if (result.kind === "saved") return { mode: "server", revision: result.revision, state: firstContact.state };
    // Server went away between GET and PUT: nothing was saved, so run like local mode.
    if (result.kind === "unreachable") return { mode: "local", state: firstContact.state };
    fileState = result.state;
    revision = result.revision;
  }
}
