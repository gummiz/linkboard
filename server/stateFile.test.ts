// @vitest-environment node
import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleState } from "../src/model";
import { readStateFile, writeStateFile } from "./stateFile";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "linkboard-state-"));
});

afterEach(async () => {
  await chmod(dataDir, 0o700);
  await rm(dataDir, { recursive: true, force: true });
});

describe("stateFile", () => {
  it("returns null when the file is missing", async () => {
    expect(await readStateFile(dataDir)).toBeNull();
  });

  it("round-trips revision and state", async () => {
    const stored = { revision: 3, state: sampleState() };
    await writeStateFile(dataDir, stored);
    expect(await readStateFile(dataDir)).toEqual(stored);
  });

  it("throws on invalid JSON", async () => {
    await writeFile(path.join(dataDir, "linkboard.json"), "{not json");
    await expect(readStateFile(dataDir)).rejects.toThrow("linkboard.json is not valid Linkboard data");
  });

  it("throws on a shape parseState rejects", async () => {
    await writeFile(path.join(dataDir, "linkboard.json"), JSON.stringify({ revision: 1, state: { version: 2 } }));
    await expect(readStateFile(dataDir)).rejects.toThrow("linkboard.json is not valid Linkboard data");
  });

  it("leaves no tmp file behind after a write", async () => {
    await writeStateFile(dataDir, { revision: 1, state: sampleState() });
    expect(await readdir(dataDir)).toEqual(["linkboard.json"]);
  });

  it("a failed write keeps the old file", async () => {
    await writeStateFile(dataDir, { revision: 1, state: sampleState() });
    await chmod(dataDir, 0o500);
    try {
      await expect(writeStateFile(dataDir, { revision: 2, state: sampleState() })).rejects.toThrow();
      expect((await readStateFile(dataDir))?.revision).toBe(1);
    } finally {
      await chmod(dataDir, 0o700);
    }
  });
});
