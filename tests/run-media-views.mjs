import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const baseline = process.env.XMD_MEDIA_VIEWS_BASELINE;
const server = await createServer({
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
  plugins: baseline ? [{
    name: "media-views-baseline", enforce: "pre",
    async load(id) {
      if (id.replaceAll("\\", "/").endsWith("/src/ui/Grid.tsx")) return readFile(baseline, "utf8");
    },
  }] : [],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const source = await readFile(new URL("./media-views.browser.js", import.meta.url), "utf8");
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const result = await new AsyncFunction("page", "assert", "fixtureUrl", source)(page, assert, "http://127.0.0.1:5180/tests/media-views.html");
  await mkdir(resolve("test-results"), { recursive: true });
  await page.screenshot({ path: resolve("test-results/media-views.png") });
  await writeFile(resolve("test-results/media-views.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
