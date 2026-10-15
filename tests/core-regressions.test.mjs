import assert from "node:assert/strict";
import test from "node:test";
import { coreHarness } from "./helpers/core-harness.mjs";
import { backgroundHarness, event } from "./helpers/background-harness.mjs";

test("startup hydrates existing records, sequence and history after importing the engine", async () => {
  const h = await coreHarness({
    xmd_downloaded_v1: JSON.stringify([["known-media", 1]]),
    xmd_seq_v1: JSON.stringify({ "alice|2026-10-14": 12 }),
    xmd_history_v1: JSON.stringify([{ id: "known", url: "known-media", user: "alice", type: "image", fileName: "known.jpg", folder: "alice", ts: 1 }]),
  });
  try {
    await h.load("core/engine.ts");
    const store = await h.load("core/store.ts");
    const history = await h.load("core/history.ts");
    // A read before hydration must not prevent the asynchronous loader from running.
    store.storeSize();
    history.getHistory();
    await Promise.all([store.initStores(), store.initStores()]);
    assert.equal(store.hasRecord("known-media"), true);
    assert.equal(store.getSeqBase("alice|2026-10-14"), 12);
    assert.equal(history.getHistory().length, 1);
    assert.equal(h.reads.filter(key => key === "xmd_downloaded_v1").length, 1);
  } finally { await h.close(); }
});

test("media bytes survive Chrome JSON messaging across multiple chunks", async () => {
  const h = await coreHarness();
  try {
    const bytes = Uint8Array.from({ length: 150001 }, (_, i) => i % 256);
    const bg = backgroundHarness({ fetch: async () => new Response(bytes, { headers: { "Content-Type": "video/mp4" } }) });
    let port;
    chrome.runtime.connect = () => port = bg.connectClient();
    const { fetchMediaBlob } = await h.load("core/downloader.ts");
    const blob = await fetchMediaBlob("https://video.twimg.com/test.mp4");
    assert.equal(blob.size, bytes.length);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
    assert.equal(blob.type, "video/mp4");
    assert.equal(port.disconnected, true);
  } finally { await h.close(); }
});

test("a malformed binary message cannot become a successful file", async () => {
  const h = await coreHarness();
  const originalFetch = globalThis.fetch;
  try {
    const port = { onMessage: event(), onDisconnect: event(), disconnect() {},
      postMessage() { queueMicrotask(() => this.onMessage.emit({ buffer: {}, size: 4 })); } };
    chrome.runtime.connect = () => port;
    globalThis.fetch = async () => { throw new Error("direct fetch unavailable"); };
    const { fetchMediaBlob } = await h.load("core/downloader.ts");
    await assert.rejects(fetchMediaBlob("https://video.twimg.com/test.mp4"), /direct fetch unavailable/);
  } finally { globalThis.fetch = originalFetch; await h.close(); }
});

test("an empty local dedup store does not discard an existing sequence counter", async () => {
  const h = await coreHarness({ xmd_seq_v1: JSON.stringify({ group: 9 }) }, false);
  try {
    const store = await h.load("core/store.ts");
    assert.equal(store.getSeqBase("group"), 9);
  } finally { await h.close(); }
});
