import assert from "node:assert/strict";
import test from "node:test";
import { coreHarness } from "./helpers/core-harness.mjs";

const input = { type: "image", url: "https://pbs.twimg.com/media/saved?format=jpg&name=orig", thumbnail: "https://pbs.twimg.com/media/saved?format=jpg&name=small", username: "alice", tweetId: "100", tweetTime: new Date("2026-10-14T12:00:00+08:00") };
const item = (id = "existing", patch = {}) => ({ ...input, id, fileName: "preview.jpg", selected: true, source: "img_tag", status: "pending", ...patch });

async function setup() {
  const h = await coreHarness();
  const { useXmd } = await h.load("core/engine.ts");
  const store = await h.load("core/store.ts");
  await store.initStores();
  const requests = [];
  chrome.runtime.sendMessage = (message, reply) => { requests.push({ message, reply }); };
  useXmd.setState({ toast() {} });
  return { ...h, useXmd, store, requests };
}

test("a single download updates the existing panel item without adding a duplicate", async () => {
  const h = await setup();
  try {
    h.useXmd.setState({ items: [item()] });
    const work = h.useXmd.getState().downloadSingle(input);
    h.requests[0].reply({ ok: true, bytes: 12 });
    await work;
    const items = h.useXmd.getState().items;
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "existing");
    assert.equal(items[0].status, "done");
    assert.equal(items[0].savedBefore, true);
    assert.equal(items[0].selected, false);
  } finally { await h.close(); }
});

test("partial hover metadata preserves the author and date already scanned into the panel", async () => {
  const h = await setup();
  try {
    h.useXmd.setState({ items: [item()] });
    const work = h.useXmd.getState().downloadSingle({ type: input.type, url: input.url, tweetTime: null });
    const filename = h.requests[0].message.filename;
    h.requests[0].reply({ ok: true, bytes: 12 });
    await work;
    const actual = h.useXmd.getState().items[0];
    assert.equal(actual.username, "alice");
    assert.equal(actual.tweetId, "100");
    assert.equal(actual.tweetTime.getTime(), input.tweetTime.getTime());
    assert.match(filename, /2026-10-14/);
  } finally { await h.close(); }
});

test("all selection actions leave downloaded items done and unchecked", async () => {
  const h = await setup();
  try {
    const saved = item("saved", { savedBefore: true, selected: false, status: "done" });
    const pending = item("pending", { url: "https://pbs.twimg.com/media/new?format=jpg", selected: false });
    for (const action of [s => s.toggleItem("saved"), s => s.selectAll(), s => s.invertSelection(), s => s.selectAuthorItems("alice"), s => s.selectTweetItems("100")]) {
      h.useXmd.setState({ items: [saved, pending] });
      action(h.useXmd.getState());
      const actual = h.useXmd.getState().items[0];
      assert.equal(actual.selected, false);
      assert.equal(actual.status, "done");
    }
  } finally { await h.close(); }
});

test("saved media is automatically excluded without requiring the old skip toggle", async () => {
  const h = await setup();
  try {
    const { markSaved } = await h.load("core/actions/shared.ts");
    h.store.addRecord(input.url.split("?")[0]);
    const items = [item()];
    markSaved(items);
    assert.equal(items[0].savedBefore, true);
    assert.equal(items[0].status, "done");
    assert.equal(items[0].selected, false);
  } finally { await h.close(); }
});

test("retrying the same failed single download preserves its reserved filename", async () => {
  const h = await setup();
  try {
    h.useXmd.setState(s => ({ items: [item()], settings: { ...s.settings, download: { ...s.settings.download, retry: false } } }));
    const first = h.useXmd.getState().downloadSingle(input);
    const filename = h.requests[0].message.filename;
    h.requests[0].reply({ ok: false, error: "NETWORK_FAILED" });
    await first;
    const retry = h.useXmd.getState().downloadSingle(input);
    const retryName = h.requests[1].message.filename;
    h.requests[1].reply({ ok: true, bytes: 12 });
    await retry;
    assert.equal(retryName, filename);
    assert.ok(retryName.endsWith(".jpg"));
  } finally { await h.close(); }
});

test("an unsuccessful single download stays retryable and has no downloaded marker", async () => {
  const h = await setup();
  try {
    h.useXmd.setState(s => ({ items: [item()], settings: { ...s.settings, download: { ...s.settings.download, retry: false } } }));
    const work = h.useXmd.getState().downloadSingle(input);
    h.requests[0].reply({ ok: false, error: "NETWORK_FAILED" });
    await work;
    const items = h.useXmd.getState().items;
    assert.equal(items.length, 1);
    assert.equal(items[0].status, "error");
    assert.equal(!!items[0].savedBefore, false);
    assert.equal(h.store.hasRecord(input.url.split("?")[0]), false);
  } finally { await h.close(); }
});

test("completed media cannot be downloaded again through batch or repeated single clicks", async () => {
  const h = await setup();
  try {
    h.store.addRecord(input.url.split("?")[0]);
    h.useXmd.setState({ items: [item("saved", { savedBefore: true })] });
    let calls = 0;
    chrome.runtime.sendMessage = (_message, reply) => { calls++; reply({ ok: true }); };
    await h.useXmd.getState().downloadAll();
    await h.useXmd.getState().downloadSingle(input);
    assert.equal(calls, 0);
  } finally { await h.close(); }
});

for (const action of ["clearStore", "clearHistoryAll", "clearHistoryUser"]) {
  test(`${action} makes explicitly cleared media selectable again`, async () => {
    const h = await setup();
    try {
      h.store.addRecord(input.url.split("?")[0]);
      const history = await h.load("core/history.ts");
      history.addHistory({ url: input.url, type: "image", user: "alice", folder: "alice", fileName: "saved.jpg", ts: Date.now() });
      h.useXmd.setState({ items: [item("saved", { status: "done", savedBefore: true, selected: false })] });
      h.useXmd.getState()[action]("alice");
      h.useXmd.getState().toggleItem("saved");
      const actual = h.useXmd.getState().items[0];
      assert.equal(actual.status, "pending");
      assert.equal(!!actual.savedBefore, false);
      assert.equal(actual.selected, true);
    } finally { await h.close(); }
  });
}
