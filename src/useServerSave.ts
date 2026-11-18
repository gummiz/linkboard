import { useCallback, useEffect, useRef } from "react";
import type { AppState } from "./model";
import {
  adoptState,
  fetchServerState,
  putServerState,
  replayPending,
  type SaveResult,
} from "./serverSync";
import type { Action } from "./store";

const SAVE_DEBOUNCE_MILLISECONDS = 300;

type UseServerSaveOptions = {
  enabled: boolean;
  initialRevision: number;
  state: AppState;
  replaceState(state: AppState): void;
  notify(message: string): void;
};

export function useServerSave(options: UseServerSaveOptions): {
  track(action: Action): void;
  saveImmediately(state: AppState): Promise<SaveResult>;
} {
  const { enabled, state } = options;
  const latestOptions = useRef(options);
  const revision = useRef(options.initialRevision);
  const pendingActions = useRef<Action[]>([]);
  const saveInFlight = useRef(false);
  const consecutiveConflicts = useRef(0);

  useEffect(() => {
    latestOptions.current = options;
  });

  const track = useCallback((action: Action) => {
    if (latestOptions.current.enabled) pendingActions.current.push(action);
  }, []);

  const saveImmediately = useCallback(async (stateToSave: AppState) => {
    const result = await putServerState(revision.current, stateToSave);
    if (result.kind !== "unreachable") revision.current = result.revision;
    return result;
  }, []);

  const savePending = useCallback(async () => {
    if (saveInFlight.current || pendingActions.current.length === 0) return;
    const { state: stateToSave, replaceState, notify } = latestOptions.current;
    const sentActions = pendingActions.current.slice();
    saveInFlight.current = true;
    let result: SaveResult;
    try {
      result = await saveImmediately(stateToSave);
    } finally {
      saveInFlight.current = false;
    }

    if (result.kind === "saved") {
      consecutiveConflicts.current = 0;
      pendingActions.current = pendingActions.current.slice(sentActions.length);
      // Edits made during the request: send them now, no state change will trigger it.
      void savePending();
      return;
    }
    if (result.kind === "unreachable") {
      notify("Not saved: server unreachable");
      return;
    }
    const localActiveBoardId = stateToSave.activeBoardId;
    consecutiveConflicts.current += 1;
    if (consecutiveConflicts.current === 1) {
      // The state change from replaceState re-triggers the debounced save.
      replaceState(adoptState(replayPending(result.state, pendingActions.current), localActiveBoardId));
      return;
    }
    consecutiveConflicts.current = 0;
    pendingActions.current = [];
    replaceState(adoptState(result.state, localActiveBoardId));
    notify("Reloaded changes from another window; your last edit was not saved.");
  }, [saveImmediately]);

  useEffect(() => {
    if (!enabled || pendingActions.current.length === 0) return;
    const timer = setTimeout(() => void savePending(), SAVE_DEBOUNCE_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [enabled, state, savePending]);

  useEffect(() => {
    if (!enabled) return;
    const refreshWhenWindowReturns = async () => {
      if (document.visibilityState === "hidden") return;
      if (pendingActions.current.length > 0) {
        void savePending();
        return;
      }
      const snapshot = await fetchServerState();
      // Re-check after the await: an edit or save may have started meanwhile.
      if (snapshot === null || snapshot.state === null) return;
      if (pendingActions.current.length > 0 || saveInFlight.current) return;
      if (snapshot.revision <= revision.current) return;
      revision.current = snapshot.revision;
      const { state: currentState, replaceState } = latestOptions.current;
      replaceState(adoptState(snapshot.state, currentState.activeBoardId));
    };
    const onWindowReturn = () => void refreshWhenWindowReturns();
    document.addEventListener("visibilitychange", onWindowReturn);
    window.addEventListener("focus", onWindowReturn);
    return () => {
      document.removeEventListener("visibilitychange", onWindowReturn);
      window.removeEventListener("focus", onWindowReturn);
    };
  }, [enabled, savePending]);

  return { track, saveImmediately };
}
