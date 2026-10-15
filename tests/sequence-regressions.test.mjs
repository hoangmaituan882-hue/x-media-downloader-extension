import assert from "node:assert/strict";
import test from "node:test";
import { coreHarness } from "./helpers/core-harness.mjs";

const input = (name, username = "alice") => ({ type: "video", url: `https://video.twimg.com/${name}.mp4`, username,
  tweetTime: new Date("2026-10-14T12:00:00+08:00") });
const queued = name => ({ ...input(name), id: name, fileName: "preview.mp4", thumbnail: "", source: "api", selected: true, status: "pending" });

async function actions(seed = {}) {
  const h = await coreHarness(seed);
  const { useXmd } = await h.load("core/engine.ts");
  const store = await h.load("core/store.ts");
  await store.initStores();
  const pending = [];
  chrome.runtime.sendMessage = (message, reply) => { pending.push({ ...message, reply }); };
  useXmd.setState({ toast() {}, subfolder: "" });
  return { ...h, useXmd, store, pending, finish(ok = true) { for (const p of pending.splice(0)) p.reply({ ok, bytes: 4, error: ok ? undefined : "NETWORK_FAILED" }); } };
}

test("concurrent single downloads reserve distinct names before either completes", async () => {
  const h = await actions();
  try {
    const a = h.useXmd.getState().downloadSingle(input("one"));
    const b = h.useXmd.getState().downloadSingle(input("two"));
    const names = h.pending.map(p => p.filename);
    const reserved = h.store.getSeqBase("alice|2026-10-14");
    h.finish();
    await Promise.all([a, b]);
    assert.equal(new Set(names).size, 2);
    assert.equal(reserved, 2);
    assert.match(names[1], /_002\.mp4$/);
  } finally { h.finish(); await h.close(); }
});

test("a batch reserves its range before a concurrent single download", async () => {
  const h = await actions({ xmd_seq_v1: JSON.stringify({ "alice|2026-10-14": 12 }) });
  try {
    h.useXmd.setState({ items: [queued("one"), queued("two")] });
    const batch = h.useXmd.getState().downloadAll();
    const single = h.useXmd.getState().downloadSingle(input("three"));
    const reserved = h.store.getSeqBase("alice|2026-10-14");
    await new Promise(r => setTimeout(r, 400));
    const names = h.pending.map(p => p.filename);
    h.finish();
    await Promise.all([batch, single]);
    assert.equal(new Set(names).size, 3);
    assert.equal(reserved, 15);
    assert.ok(names.some(name => /_015\.mp4$/.test(name)));
  } finally { h.finish(); await h.close(); }
});

test("a failed attempt does not release its reserved filename for another media item", async () => {
  const h = await actions();
  try {
    h.useXmd.setState(s => ({ settings: { ...s.settings, download: { ...s.settings.download, retry: false } } }));
    const a = h.useXmd.getState().downloadSingle(input("one"));
    const firstName = h.pending[0].filename;
    h.finish(false);
    await a;
    const b = h.useXmd.getState().downloadSingle(input("two"));
    const secondName = h.pending[0].filename;
    h.finish();
    await b;
    assert.notEqual(firstName, secondName);
    assert.equal(h.store.getSeqBase("alice|2026-10-14"), 2);
    assert.equal(h.store.hasRecord("https://video.twimg.com/one.mp4"), false);
  } finally { h.finish(); await h.close(); }
});

test("authors sharing a manual destination folder also share its sequence", async () => {
  const h = await actions();
  try {
    h.useXmd.setState({ subfolder: "shared-backup" });
    const a = h.useXmd.getState().downloadSingle(input("one", "alice"));
    const b = h.useXmd.getState().downloadSingle(input("two", "bob"));
    const names = h.pending.map(p => p.filename);
    h.finish();
    await Promise.all([a, b]);
    assert.equal(new Set(names).size, 2);
    assert.equal(h.store.getSeqBase("shared-backup|2026-10-14"), 2);
    assert.ok(names.every(name => name.startsWith("shared-backup/")));
  } finally { h.finish(); await h.close(); }
});

test("preview numbering follows the resolved folder without consuming sequence numbers", async () => {
  const h = await actions();
  try {
    const { makeHelpers } = await h.load("core/actions/shared.ts");
    const helpers = makeHelpers(h.useXmd.setState, h.useXmd.getState);
    h.useXmd.setState({ subfolder: "shared-backup" });
    const items = [queued("one"), { ...queued("two"), username: "bob" }];
    helpers.renumberAll(items);
    assert.equal(new Set(items.map(it => it.fileName)).size, 2);
    assert.deepEqual(h.store.dumpSeq(), {});
  } finally { await h.close(); }
});

test("renumbering and folder changes leave an in-flight filename and destination intact", async () => {
  const h = await actions();
  try {
    const { makeHelpers } = await h.load("core/actions/shared.ts");
    const helpers = makeHelpers(h.useXmd.setState, h.useXmd.getState);
    const batch = h.useXmd.getState().downloadSingle(input("one"));
    const item = h.useXmd.getState().items[0];
    const originalName = item.fileName;
    h.useXmd.setState({ subfolder: "another-folder" });
    helpers.renumberAll([item, queued("two")]);
    h.finish();
    await batch;
    assert.equal(item.fileName, originalName);
    assert.deepEqual(item.downloadSegments, ["alice"]);
    const { getHistory } = await h.load("core/history.ts");
    assert.equal(getHistory()[0].folder, "alice");
  } finally { h.finish(); await h.close(); }
});
