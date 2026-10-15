import assert from "node:assert/strict";
import test from "node:test";
import { backgroundHarness } from "./helpers/background-harness.mjs";

const request = { type: "xmd-download-file", url: "https://example.test/media", filename: "a.mp4" };

test("an interrupted download returns failure and releases its listener", () => {
  const item = { id: 7, state: "in_progress", fileSize: -1 };
  const bg = backgroundHarness({ item });
  const replies = bg.send(request);
  item.state = "interrupted";
  item.error = "NETWORK_FAILED";
  bg.changes.emit({ id: 7, state: { current: "interrupted" }, error: { current: "NETWORK_FAILED" } });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].ok, false);
  assert.match(replies[0].error, /NETWORK_FAILED/);
  assert.equal(bg.changes.size, 0);
});

test("a slow download stays pending until Chrome reports complete", () => {
  const item = { id: 7, state: "in_progress", fileSize: -1 };
  const bg = backgroundHarness({ item });
  const replies = bg.send(request);
  for (const timer of bg.timers) if (!timer.cancelled) timer.fn();
  assert.deepEqual(replies, []);
  bg.changes.emit({ id: 99, state: { current: "complete" } });
  assert.deepEqual(replies, []);
  item.state = "complete";
  item.fileSize = 12345;
  bg.changes.emit({ id: 7, state: { current: "complete" } });
  assert.deepEqual(replies, [{ ok: true, id: 7, bytes: 12345 }]);
  assert.equal(bg.changes.size, 0);
});

test("a download finishing before listener registration is still acknowledged", () => {
  const bg = backgroundHarness({ item: { id: 7, state: "complete", fileSize: 24 } });
  assert.deepEqual(bg.send(request), [{ ok: true, id: 7, bytes: 24 }]);
  assert.equal(bg.changes.size, 0);
});

test("Chrome must return a download id before the download can succeed", () => {
  const bg = backgroundHarness({ downloads: { download: (_opts, cb) => cb(undefined) } });
  assert.equal(bg.send(request)[0]?.ok, false);
});
