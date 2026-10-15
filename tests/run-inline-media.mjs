import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 5181, strictPort: true } });
let browser;
const results = [];
try {
  await server.listen();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route("https://pbs.twimg.com/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"><defs><linearGradient id="a"><stop stop-color="#775bc4"/><stop offset="1" stop-color="#d99ca8"/></linearGradient></defs><rect width="800" height="480" fill="url(#a)"/><circle cx="580" cy="150" r="100" fill="#ffd9b4"/></svg>' }));
  async function fresh() {
    await page.goto("http://127.0.0.1:5181/tests/inline-media.html");
    await page.waitForFunction(() => !!window.inlineFixture);
    await page.locator(".xm").waitFor();
  }
  async function check(name, work) {
    try { await fresh(); await work(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
  }
  await check("photo circle morphs into a label with no detached tooltip", async () => {
    await page.locator("#photo").hover();
    const button = page.locator(".xmd-media-dl");
    await button.waitFor({ state: "visible" });
    assert.equal(await page.locator(".xmd-media-tip").count(), 0);
    const closed = await button.boundingBox();
    assert.ok(Math.abs(closed.width - 32) < 1);
    await button.hover();
    await page.waitForFunction(() => document.querySelector(".xmd-media-dl").getBoundingClientRect().width > 90);
    assert.equal(await button.innerText(), "下载原图");
    assert.equal(await button.getAttribute("title"), null);
    assert.equal(await button.getAttribute("aria-label"), "下载原图");
    await mkdir(resolve("test-results"), { recursive: true });
    await page.screenshot({ path: resolve("test-results/inline-media-pill.png") });
  });
  await check("playing video remains downloadable through its overlay", async () => {
    await page.evaluate(() => document.querySelector("video").play());
    await page.locator("#video-overlay").hover();
    const button = page.locator(".xmd-media-dl");
    await button.waitFor({ state: "visible", timeout: 2000 });
    assert.equal(await button.getAttribute("aria-label"), "下载视频");
    await button.click();
    await page.waitForFunction(() => window.inlineFixture.requests.length === 1);
    assert.equal(await page.evaluate(() => window.inlineFixture.requests[0].message.url), "https://video.twimg.com/inline-regression.mp4");
    await page.evaluate(() => window.inlineFixture.complete());
  });
  await check("a player poster overlay resolves to the video instead of a decorative image", async () => {
    await page.evaluate(() => {
      const poster = document.createElement("img");
      poster.id = "player-poster";
      poster.src = document.querySelector("video").poster;
      poster.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
      document.querySelector("#video-overlay").appendChild(poster);
    });
    await page.locator("#player-poster").hover();
    await page.locator(".xmd-media-dl").waitFor({ state: "visible", timeout: 2000 });
    assert.equal(await page.locator(".xmd-media-dl").getAttribute("aria-label"), "下载视频");
  });
  await check("single download and rescan show one locked downloaded item in every view", async () => {
    await page.evaluate(() => window.inlineFixture.store.getState().scan());
    await page.locator("#photo").hover();
    await page.locator(".xmd-media-dl").click();
    await page.waitForFunction(() => window.inlineFixture.requests.length === 1);
    assert.equal(await page.locator(".xmd-media-dl").getAttribute("aria-label"), "下载中");
    await page.evaluate(() => window.inlineFixture.complete());
    await page.waitForFunction(() => window.inlineFixture.store.getState().items.find(item => item.type === "image")?.savedBefore);
    assert.equal(await page.evaluate(() => window.inlineFixture.store.getState().items.filter(item => item.type === "image").length), 1);
    // Simulate the later scan session using the persisted dedup record.
    await page.evaluate(async () => {
      const { store } = window.inlineFixture;
      store.setState({ items: [], settings: { ...store.getState().settings, download: { ...store.getState().settings.download, skipDownloaded: false } } });
      await store.getState().scan();
    });
    for (const view of ["list", "card", "tweet", "pack"]) {
      await page.evaluate(view => window.inlineFixture.store.getState().setMediaView(view), view);
      const saved = page.locator('[data-xmd-saved="true"]');
      await saved.first().waitFor({ timeout: 2000 });
      assert.ok((await saved.allTextContents()).some(text => text === "已下载"));
    }
    await page.evaluate(() => window.inlineFixture.store.getState().selectAll());
    assert.equal(await page.evaluate(() => window.inlineFixture.store.getState().items.find(item => item.type === "image").selected), false);
  });
  await check("video setting changes hide an already visible overlay button", async () => {
    await page.locator("#video-overlay").hover();
    await page.locator(".xmd-media-dl").waitFor({ state: "visible", timeout: 2000 });
    await page.evaluate(() => window.inlineFixture.store.getState().setSettings({ inline: { onVideos: false } }));
    await page.locator(".xmd-media-dl").waitFor({ state: "hidden", timeout: 2000 });
  });
  await check("reduced motion keeps the capsule usable without transitions", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#photo").hover();
    await page.locator(".xmd-media-dl").hover();
    const duration = await page.locator(".xmd-media-dl").evaluate(button => getComputedStyle(button).transitionDuration);
    assert.ok(duration.split(",").every(value => parseFloat(value) === 0));
  });
  await mkdir(resolve("test-results"), { recursive: true });
  await writeFile(resolve("test-results/inline-media.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  assert.ok(results.every(result => result.pass), "inline media regressions failed");
} finally { await browser?.close(); await server.close(); }
