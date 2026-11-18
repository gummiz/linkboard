// @vitest-environment node
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleState } from "../src/model";
import { createLinkboardServer } from "./server";

let dataDir: string;
let rootDir: string;
let distDir: string;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "linkboard-data-"));
  rootDir = await mkdtemp(path.join(tmpdir(), "linkboard-root-"));
  distDir = path.join(rootDir, "dist");
  await mkdir(distDir);
  await writeFile(path.join(rootDir, "secret.txt"), "secret");
  await mkdir(path.join(rootDir, "dist-evil"));
  await writeFile(path.join(rootDir, "dist-evil", "x"), "secret");
  await writeFile(path.join(distDir, "index.html"), "<p>app</p>");
  await mkdir(path.join(distDir, "assets"));
  await writeFile(path.join(distDir, "assets", "a.js"), "console.log(1)");
  server = createLinkboardServer({ dataDir, distDir });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
  await rm(rootDir, { recursive: true, force: true });
});

function putState(baseRevision: unknown, state: unknown) {
  return fetch(`${baseUrl}/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseRevision, state }),
  });
}

describe("state API", () => {
  it("GET on missing file returns revision 0 and null state", async () => {
    const response = await fetch(`${baseUrl}/api/state`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ revision: 0, state: null });
  });

  it("PUT then GET round-trips", async () => {
    const state = sampleState();
    const putResponse = await putState(0, state);
    expect(putResponse.status).toBe(200);
    expect(await putResponse.json()).toEqual({ revision: 1 });
    const getResponse = await fetch(`${baseUrl}/api/state`);
    expect(await getResponse.json()).toEqual({ revision: 1, state });
  });

  it("stale baseRevision returns 409 with current state", async () => {
    const state = sampleState();
    await putState(0, state);
    const response = await putState(0, state);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ revision: 1, state });
  });

  it("invalid state returns 400 and does not create the file", async () => {
    const response = await putState(0, { version: 2 });
    expect(response.status).toBe(400);
    await expect(readFile(path.join(dataDir, "linkboard.json"))).rejects.toThrow();
  });

  it("non-integer baseRevision returns 400", async () => {
    expect((await putState("0", sampleState())).status).toBe(400);
  });

  it("invalid JSON returns 400", async () => {
    const response = await fetch(`${baseUrl}/api/state`, { method: "PUT", body: "{oops" });
    expect(response.status).toBe(400);
  });

  it("body over 5 MB returns 413", async () => {
    const response = await fetch(`${baseUrl}/api/state`, { method: "PUT", body: "x".repeat(5 * 1024 * 1024 + 1) });
    expect(response.status).toBe(413);
  });

  it("concurrent PUTs with same baseRevision: one wins", async () => {
    const responses = await Promise.all([putState(0, sampleState()), putState(0, sampleState())]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("GET returns 500 and leaves a corrupt file untouched", async () => {
    const stateFilePath = path.join(dataDir, "linkboard.json");
    await writeFile(stateFilePath, "{oops");
    const response = await fetch(`${baseUrl}/api/state`);
    expect(response.status).toBe(500);
    expect(await response.json()).toHaveProperty("error");
    expect(await readFile(stateFilePath, "utf8")).toBe("{oops");
  });

  it("unknown /api path returns 404", async () => {
    expect((await fetch(`${baseUrl}/api/nope`)).status).toBe(404);
  });
});

describe("static files", () => {
  it("serves dist files and falls back to index.html", async () => {
    const asset = await fetch(`${baseUrl}/assets/a.js`);
    expect(asset.headers.get("content-type")).toContain("javascript");
    const fallback = await fetch(`${baseUrl}/some/route`);
    expect(await fallback.text()).toBe("<p>app</p>");
    expect(fallback.headers.get("cache-control")).toBe("no-cache");
    expect(await (await fetch(`${baseUrl}/`)).text()).toBe("<p>app</p>");
  });

  it("does not serve files outside dist", async () => {
    // Encoded slashes stay intact on the wire and become "../" only after decodeURIComponent.
    for (const url of ["/%2e%2e%2fsecret.txt", "/..%2fsecret.txt", "/..%2fdist-evil%2fx"]) {
      const response = await fetch(`${baseUrl}${url}`);
      expect(response.status, url).toBe(404);
      expect(await response.text(), url).not.toBe("secret");
    }
  });
});
