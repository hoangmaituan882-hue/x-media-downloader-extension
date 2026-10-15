import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 5182, strictPort: true } });
let browser;
const results = [];
try {
  await server.listen();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("xmd_history_v1", JSON.stringify([{ id: "hover-history", user: "alice", type: "image", url: "https://pbs.twimg.com/media/hover-history?format=jpg", fileName: "hover-history.jpg", folder: "alice", ts: Date.now() }]));
  });
  await page.route("https://pbs.twimg.com/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#9b8ad6"/></svg>' }));
  const frames = ms => page.evaluate(ms => new Promise(resolve => {
    const start = performance.now();
    const sample = () => performance.now() - start >= ms ? resolve() : requestAnimationFrame(sample);
    requestAnimationFrame(sample);
  }), ms);
  async function fresh(view = "card") {
    await page.mouse.move(10, 10);
    await page.goto("http://127.0.0.1:5182/tests/media-views.html");
    await page.waitForFunction(() => !!window.mediaViewFixture);
    if (view === "history") {
      await page.evaluate(() => window.mediaViewFixture.setState({ view: "history", storeCount: 1 }));
      await page.locator("#xmd-host .b-row").first().click();
    } else {
      await page.evaluate(view => window.mediaViewFixture.setView(view), view);
    }
    await frames(800);
    await page.evaluate(() => {
      const root = document.querySelector("#xmd-host").shadowRoot;
      window.hoverEvents = [];
      for (const type of ["pointerover", "pointerout"]) root.addEventListener(type, event => {
        window.hoverEvents.push({ type, target: event.target.className?.baseVal ?? event.target.className, related: event.relatedTarget?.className?.baseVal ?? event.relatedTarget?.className, x: event.clientX, y: event.clientY });
      }, true);
    });
  }
  async function check(name, work) {
    try { await work(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message, events: await page.evaluate(() => window.hoverEvents?.slice(-12)) }); }
  }
  const thumb = view => view === "history" ? page.locator("#xmd-host .drill .th").first() : page.locator("#xmd-host .xm-panel img").first();
  for (const view of ["list", "card", "tweet", "history"]) {
    await check(`${view}: stationary pointer keeps the full preview open`, async () => {
      await fresh(view);
      await thumb(view).hover();
      await page.locator("#xmd-host .xhd-preview").waitFor({ state: "visible", timeout: 2000 });
      const samples = await page.evaluate(() => new Promise(resolve => {
        const root = document.querySelector("#xmd-host").shadowRoot;
        const samples = [];
        const start = performance.now();
        const sample = () => {
          const preview = root.querySelector(".xhd-preview");
          samples.push({ time: performance.now() - start, width: preview?.getBoundingClientRect().width ?? 0, opacity: preview ? +getComputedStyle(preview.parentElement).opacity : 0 });
          if (performance.now() - start < 1100) requestAnimationFrame(sample);
          else resolve(samples);
        };
        requestAnimationFrame(sample);
      }));
      const settled = samples.filter(sample => sample.time > 500);
      assert.ok(settled.every(sample => sample.width >= 290 && sample.opacity > 0.98), `${view}: preview collapsed while pointer stayed on its thumbnail: ${JSON.stringify(settled.slice(-5))}`);
      if (view === "card") {
        await mkdir(resolve("test-results"), { recursive: true });
        await page.screenshot({ path: resolve("test-results/hover-preview.png") });
      }
      await page.mouse.move(20, 20);
      await page.locator("#xmd-host .xhd-preview").waitFor({ state: "detached", timeout: 2000 });
    });
  }
  await check("moving from thumbnail to large image keeps it open until the pointer leaves both", async () => {
    await fresh();
    await thumb("card").hover();
    await page.locator("#xmd-host .xhd-preview").waitFor({ state: "visible", timeout: 2000 });
    await frames(600);
    await page.locator("#xmd-host .xhd-preview").hover();
    await frames(400);
    assert.equal(await page.locator("#xmd-host .xhd-preview").count(), 1);
    await page.mouse.move(20, 20);
    await page.locator("#xmd-host .xhd-preview").waitFor({ state: "detached", timeout: 2000 });
  });
  await check("a quick pass over a thumbnail never opens a delayed ghost preview", async () => {
    await fresh();
    await thumb("card").hover();
    await page.mouse.move(20, 20);
    await frames(450);
    assert.equal(await page.locator("#xmd-host .xhd-preview").count(), 0);
  });
  await check("clicking the backdrop dismisses the preview without immediately reopening", async () => {
    await fresh();
    const source = await thumb("card").boundingBox();
    await thumb("card").hover();
    await page.locator("#xmd-host .xhd-preview").waitFor({ state: "visible", timeout: 2000 });
    await frames(600);
    await page.mouse.click(source.x + source.width / 2, source.y + source.height / 2);
    await frames(900);
    assert.equal(await page.locator("#xmd-host .xhd-preview").count(), 0);
    await page.mouse.move(20, 20);
    await thumb("card").hover();
    await page.locator("#xmd-host .xhd-preview").waitFor({ state: "visible", timeout: 2000 });
  });
  await check("changing views cancels a pending hover preview", async () => {
    await fresh();
    await thumb("card").hover();
    await page.evaluate(() => window.mediaViewFixture.setView("list"));
    await page.mouse.move(20, 20);
    await frames(500);
    assert.equal(await page.locator("#xmd-host .xhd-preview").count(), 0);
  });
  assert.deepEqual(errors, []);
  await mkdir(resolve("test-results"), { recursive: true });
  await writeFile(resolve("test-results/hover-preview.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  assert.ok(results.every(result => result.pass), "hover preview regressions failed");
} finally { await browser?.close(); await server.close(); }
