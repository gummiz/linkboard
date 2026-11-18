import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppState } from "../src/model";
import { parseState } from "../src/storage";

export type StoredState = { revision: number; state: AppState };

const STATE_FILE_NAME = "linkboard.json";
const INVALID_DATA_MESSAGE = `${STATE_FILE_NAME} is not valid Linkboard data`;

export async function readStateFile(dataDir: string): Promise<StoredState | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(dataDir, STATE_FILE_NAME), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(INVALID_DATA_MESSAGE);
  }
  const revision = (parsed as { revision?: unknown } | null)?.revision;
  const state = parseState((parsed as { state?: unknown } | null)?.state);
  if (!Number.isInteger(revision) || state === null) throw new Error(INVALID_DATA_MESSAGE);
  return { revision: revision as number, state };
}

/** Writes to a tmp file, then renames: readers never see a half-written file. */
export async function writeStateFile(dataDir: string, stored: StoredState): Promise<void> {
  const temporaryPath = path.join(dataDir, `${STATE_FILE_NAME}.${randomUUID()}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`);
  await rename(temporaryPath, path.join(dataDir, STATE_FILE_NAME));
}
