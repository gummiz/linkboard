// Drives the built app in Chromium. Usage:
//   npm run build && npx vite preview --port 4173 &
//   CHROMIUM_PATH=/path/to/chrome npm run test:e2e
// Screenshots and fixtures go to e2e/output/.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4173/";
const out = new URL("./output", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" },
);
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !/favicon|ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()));
const check = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) process.exitCode = 1; };
const itemsOf = (cat) => page.locator(`article.category:has(input[aria-label="Category name"][value="${cat}"]) .item-name`).allTextContents();

await page.goto(baseUrl);
await page.screenshot({ path: `${out}/01-initial.png` });
check("sample board renders 4 categories", (await page.locator("article.category").count()) === 4);

await page.getByLabel("Add link to News").fill("github.com/features");
await page.getByLabel("Add link to News").press("Enter");
check("add link appends to News", (await itemsOf("News")).at(-1) === "github.com");

await page.getByLabel("Add link to News").fill("not a url");
await page.getByLabel("Add link to News").press("Enter");
check("invalid link shows error", await page.getByText("Enter a web address").isVisible());

await page.locator('.item:has-text("Hacker News")').dragTo(page.locator('.item:has-text("Wikipedia")'), { targetPosition: { x: 20, y: 3 } });
check("drag moves Hacker News before Wikipedia", JSON.stringify(await itemsOf("Reference")) === JSON.stringify(["Hacker News", "Wikipedia", "MDN Web Docs"]));
check("drag removes it from News", !(await itemsOf("News")).includes("Hacker News"));

await page.locator('article.category:has(input[value="Tools"]) .category-header').dragTo(page.locator('article.category:has(input[value="Getting started"]) .category-header'), { targetPosition: { x: 40, y: 2 } });
const order = await page.locator('input[aria-label="Category name"]').evaluateAll((els) => els.map((e) => e.value));
check(`category drag reorders (${order.join(", ")})`, order[0] === "Tools");

await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("/");
await page.keyboard.type("wiki");
check("search finds Wikipedia", (await page.locator(".search-results [role=option]").first().textContent()).includes("Wikipedia"));
await page.screenshot({ path: `${out}/02-search.png` });
await page.keyboard.press("Escape");

for (let i = 1; i <= 7; i++) { await page.getByLabel("Add link to Tools").fill(`tool${i}.example.com`); await page.getByLabel("Add link to Tools").press("Enter"); }
check("excess links collapse behind + N more", await page.getByRole("button", { name: "+ 3 more" }).isVisible());
await page.getByRole("button", { name: "+ 3 more" }).click();
check("show all reveals 9 links", (await itemsOf("Tools")).length === 9);

await page.locator('.item:has-text("BBC News")').hover();
await page.getByLabel("Edit BBC News").click();
await page.locator(".item-editor textarea").fill("World news");
await page.locator(".item-editor select").selectOption({ label: "Reference" });
await page.getByRole("button", { name: "Save" }).click();
check("editor moves item and saves note", (await itemsOf("Reference")).includes("BBC News") && await page.getByText("World news").isVisible());

await page.getByLabel("Collapse Getting started").click();
check("collapse hides links", (await itemsOf("Getting started")).length === 0);

await page.reload();
check("state persists across reload", (await itemsOf("Reference")).includes("BBC News") && (await itemsOf("Tools")).length === 9);

writeFileSync(`${out}/bookmarks.html`, `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Work</H3><DL><p><DT><A HREF="https://example.org/">Example</A></DL><p></DL><p>`);
await page.locator('input[type=file]').setInputFiles(`${out}/bookmarks.html`);
await page.waitForSelector(".notice");
check("import creates board", (await page.locator(".board-link-name").allTextContents()).includes("Work") && (await itemsOf("General")).includes("Example"));
await page.locator(".board-link", { hasText: "My First Board" }).click();
await page.screenshot({ path: `${out}/03-board.png`, fullPage: true });

await page.getByRole("button", { name: "+ New board" }).click();
await page.getByLabel("New board name").fill("Reading");
await page.getByLabel("New board name").press("Enter");
check("new board is active and empty", await page.getByText("This board is empty").isVisible());

writeFileSync(`${out}/multi.html`, `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Articles</H3><DL><p><DT><A HREF="https://example.com/read">Read me</A></DL><p><DT><H3>Tools</H3><DL><p><DT><A HREF="https://example.com/tool">Tool</A></DL><p><DT><A HREF="https://example.com/loose">Loose</A></DL><p>`);
await page.locator('input[type=file]').setInputFiles(`${out}/multi.html`);
await page.locator(".notice", { hasText: "into 3 boards" }).waitFor();
const boardNames = await page.locator(".board-link-name").allTextContents();
check(`import of 2 folders + loose link adds 3 boards (${boardNames.join(", ")})`, ["Articles", "Tools", "multi"].every((name) => boardNames.includes(name)));
check("notice reports 3 links into 3 boards", (await page.locator(".notice").textContent()).includes("Imported 3 links into 3 boards"));

await page.setViewportSize({ width: 375, height: 800 });
await page.locator(".board-link", { hasText: "My First Board" }).click();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(`no horizontal scroll on phone (${overflow}px)`, overflow <= 0);
await page.screenshot({ path: `${out}/04-mobile.png` });
await page.setViewportSize({ width: 320, height: 640 });
const narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(`no horizontal scroll at 320px (${narrowOverflow}px)`, narrowOverflow <= 0);

await page.setViewportSize({ width: 1280, height: 860 });
await page.emulateMedia({ colorScheme: "dark" });
await page.screenshot({ path: `${out}/05-dark.png` });
check(`no page errors ${JSON.stringify(errors)}`, errors.length === 0);
await browser.close();
