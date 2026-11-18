import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createLinkboardServer } from "./server";

const dataDir = process.env.LINKBOARD_DATA_DIR;
if (!dataDir) {
  console.error("LINKBOARD_DATA_DIR is required");
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8080);
const distDir = process.env.DIST_DIR ?? fileURLToPath(new URL("../dist", import.meta.url));

await mkdir(dataDir, { recursive: true });
createLinkboardServer({ dataDir, distDir }).listen(port, "0.0.0.0", () => {
  console.error(`Linkboard listening on port ${port}, data dir ${dataDir}`);
});
