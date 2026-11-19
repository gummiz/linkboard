import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import type { AppState, RevisionedState } from "../src/model";
import { isRecord, parseState } from "../src/storage";
import { readStateFile, writeStateFile } from "./stateFile";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const EMPTY_STORED_STATE: RevisionedState<null> = { revision: 0, state: null };

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

type Options = { dataDir: string; distDir: string };

function sendJson(response: http.ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

/** Resolves with the raw body, or null when it exceeds MAX_BODY_BYTES (the rest is drained, not stored). */
function readBody(request: http.IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    request.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    request.on("end", () => { resolve(receivedBytes > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString("utf8")); });
    request.on("error", reject);
  });
}

export function createLinkboardServer({ dataDir, distDir: distDirOption }: Options): http.Server {
  const distDir = path.resolve(distDirOption);
  // PUTs run one at a time so read-compare-write of the revision is not interleaved.
  let putQueue: Promise<unknown> = Promise.resolve();

  async function handleGetState(response: http.ServerResponse) {
    const stored = await readStateFile(dataDir);
    sendJson(response, 200, stored ?? EMPTY_STORED_STATE);
  }

  async function applyPut(response: http.ServerResponse, baseRevision: number, state: AppState) {
    const current = (await readStateFile(dataDir)) ?? EMPTY_STORED_STATE;
    if (baseRevision !== current.revision) {
      sendJson(response, 409, current);
      return;
    }
    const revision = current.revision + 1;
    await writeStateFile(dataDir, { revision, state });
    sendJson(response, 200, { revision });
  }

  async function handlePutState(request: http.IncomingMessage, response: http.ServerResponse) {
    const rawBody = await readBody(request);
    if (rawBody === null) { sendJson(response, 413, { error: "Body too large" }); return; }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      sendJson(response, 400, { error: "Invalid JSON" }); return;
    }
    const state = isRecord(body) ? parseState(body.state) : null;
    const baseRevision = isRecord(body) ? body.baseRevision : undefined;
    if (state === null || typeof baseRevision !== "number" || !Number.isInteger(baseRevision)) {
      sendJson(response, 400, { error: "Invalid baseRevision or state" }); return;
    }
    const result = putQueue.then(() => applyPut(response, baseRevision, state));
    putQueue = result.catch(() => undefined);
    await result;
  }

  async function handleStatic(url: URL, response: http.ServerResponse) {
    let requestedPath: string;
    try {
      requestedPath = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(404).end();
      return;
    }
    const filePath = path.resolve(distDir, `.${requestedPath}`);
    if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
      response.writeHead(404).end();
      return;
    }
    let servedPath = filePath;
    let content: Buffer;
    try {
      content = await readFile(filePath);
    } catch {
      // Only extensionless paths are SPA routes; a missing /assets/x.js must not answer with HTML.
      if (path.extname(filePath) !== "") {
        response.writeHead(404).end();
        return;
      }
      servedPath = path.join(distDir, "index.html");
      content = await readFile(servedPath);
    }
    const headers: http.OutgoingHttpHeaders = {
      "Content-Type": CONTENT_TYPE_BY_EXTENSION[path.extname(servedPath)] ?? "application/octet-stream",
    };
    if (path.basename(servedPath) === "index.html") headers["Cache-Control"] = "no-cache";
    response.writeHead(200, headers).end(content);
  }

  async function route(request: http.IncomingMessage, response: http.ServerResponse) {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/state" && request.method === "GET") return handleGetState(response);
    if (url.pathname === "/api/state" && request.method === "PUT") return handlePutState(request, response);
    if (url.pathname.startsWith("/api/")) { sendJson(response, 404, { error: "Not found" }); return; }
    return handleStatic(url, response);
  }

  return http.createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      console.error(`500 ${request.method ?? "-"} ${request.url ?? "-"}:`, error);
      if (response.headersSent) return response.destroy();
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Internal error" });
    });
  });
}
