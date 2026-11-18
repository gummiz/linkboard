// Two browser contexts sync through the Node server. Usage:
//   npm run build
//   CHROMIUM_PATH=/path/to/chrome npm run test:e2e:sync
// Starts dist-server/main.js on port 4174 with a temp data dir.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = "http://127.0.0.1:4174/";
const dataDir = mkdtempSync(join(tmpdir(), "linkboard-e2e-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) process.exitCode = 1; };
const poll = async (condition, timeoutMs) => {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await sleep(100)) {
    if (await condition()) return true;
  }
  return false;
};

const server = spawn("node", ["dist-server/main.js"], {
  env: { ...process.env, LINKBOARD_DATA_DIR: dataDir, PORT: "4174" },
  stdio: "inherit",
});
let browser;
try {
  const serverIsUp = await poll(() => fetch(`${baseUrl}api/state`).then((r) => r.ok, () => false), 5000);
  check("server answers /api/state", serverIsUp);
  if (!serverIsUp) throw new Error("server did not start within 5 s");

  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" },
  );
  const pageA = await (await browser.newContext()).newPage();
  const pageB = await (await browser.newContext()).newPage();
  const newsLinks = (page) => page.locator('article.category:has(input[aria-label="Category name"][value="News"]) .item-name').allTextContents();

  await pageA.goto(baseUrl);
  await pageB.goto(baseUrl);
  await pageA.getByLabel("Add link to News").fill("github.com/features");
  await pageA.getByLabel("Add link to News").press("Enter");
  check("A shows the new link", (await newsLinks(pageA)).includes("github.com"));

  // A saves after a debounce; B can only see the link once the server has it
  const savedOnServer = await poll(() => fetch(`${baseUrl}api/state`).then((r) => r.text()).then((text) => text.includes("github.com/features")), 3000);
  check("server has the link", savedOnServer);
  const linkIsOnDisk = readFileSync(join(dataDir, "linkboard.json"), "utf8").includes("github.com/features");
  check("linkboard.json on disk contains the URL", linkIsOnDisk);

  await pageB.evaluate(() => window.dispatchEvent(new Event("focus")));
  check("B picks up the link after focus", await poll(async () => (await newsLinks(pageB)).includes("github.com"), 3000));
} finally {
  await browser?.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
