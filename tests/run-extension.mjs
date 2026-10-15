import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import { chromium } from "@playwright/test";
import { build } from "vite";

// A separate profile and copied extension keep these real Chrome API checks isolated.
const tempRoot = await realpath(tmpdir());
const work = await mkdtemp(join(tempRoot, "xmd-extension-regression-"));
const extensionPath = join(work, "extension");
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": 8 });
  res.write("test");
  const timer = setTimeout(() => res.end("done"), 9200);
  res.on("close", () => clearTimeout(timer));
});
let context;
try {
  await cp(resolve("dist"), extensionPath, { recursive: true });
  const manifest = JSON.parse(await readFile(join(extensionPath, "manifest.json"), "utf8"));
  manifest.host_permissions.push("http://127.0.0.1/*");
  await writeFile(join(extensionPath, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(extensionPath, "probe.html"), "<!doctype html><title>XMD regression</title>");
  await build({ configFile: false, logLevel: "silent", build: { outDir: extensionPath, emptyOutDir: false,
    lib: { entry: resolve("src/core/downloader.ts"), formats: ["es"], fileName: () => "probe-downloader.js" } } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  context = await chromium.launchPersistentContext(join(work, "profile"), {
    channel: "msedge", headless: true, acceptDownloads: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).hostname;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/probe.html`);
  const result = await page.evaluate(async baseUrl => {
    const { fetchMediaBlob, writeViaFS, downloadItem } = await import("./probe-downloader.js");
    const bytes = Uint8Array.from({ length: 150001 }, (_, i) => i % 256);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    const url = `data:video/mp4;base64,${btoa(binary)}`;
    let fallbackCalls = 0;
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      if (String(args[0]).startsWith("data:")) { fallbackCalls++; throw new Error("Direct fallback disabled in this regression"); }
      return originalFetch(...args);
    };
    const blob = await fetchMediaBlob(url);
    const received = new Uint8Array(await blob.arrayBuffer());
    const exact = received.length === bytes.length && received.every((value, i) => value === bytes[i]);
    const root = await navigator.storage.getDirectory();
    const fsResult = await writeViaFS(root, "binary.mp4", url, ["nested"]);
    const directory = await root.getDirectoryHandle("nested");
    const saved = await (await directory.getFileHandle("binary.mp4")).getFile();
    const savedBytes = new Uint8Array(await saved.arrayBuffer());
    const fsExact = savedBytes.length === bytes.length && savedBytes.every((value, i) => value === bytes[i]);
    const item = { id: "native", type: "image", url: `${baseUrl}/slow`, thumbnail: "", fileName: "slow.bin", source: "api", selected: true, status: "pending", tweetTime: null };
    const started = performance.now();
    const slow = await downloadItem(item, null, []);
    const elapsed = performance.now() - started;
    const cancelUrl = `${baseUrl}/cancel`;
    const onCreated = item => {
      if (item.url === cancelUrl) chrome.downloads.cancel(item.id);
    };
    chrome.downloads.onCreated.addListener(onCreated);
    let cancelled;
    try { cancelled = await downloadItem({ ...item, url: cancelUrl, fileName: "cancel.bin" }, null, []); }
    finally { chrome.downloads.onCreated.removeListener(onCreated); }
    return { exact, bytes: blob.size, mime: blob.type, fallbackCalls, fsResult, fsExact, slow, elapsed, cancelled };
  }, `http://127.0.0.1:${server.address().port}`);
  assert.equal(result.exact, true);
  assert.equal(result.bytes, 150001);
  assert.equal(result.mime, "video/mp4");
  assert.equal(result.fallbackCalls, 0);
  assert.equal(result.fsResult.success, true);
  assert.equal(result.fsExact, true);
  assert.equal(result.slow.success, true);
  assert.equal(result.slow.bytes, 8);
  assert.ok(result.elapsed >= 9000, `download acknowledged too early: ${result.elapsed} ms`);
  assert.equal(result.cancelled.success, false);
  await mkdir(resolve("test-results"), { recursive: true });
  await writeFile(resolve("test-results/extension.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  const resolvedWork = await realpath(work);
  const withinTemp = relative(tempRoot, resolvedWork);
  assert.ok(withinTemp && !withinTemp.startsWith("..") && !isAbsolute(withinTemp));
  await rm(resolvedWork, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
