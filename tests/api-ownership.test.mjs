import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { coreHarness } from "./helpers/core-harness.mjs";

const template = id => `https://x.com/i/api/graphql/dynamic-query/UserMedia?variables=${encodeURIComponent(JSON.stringify({ userId: id }))}&features=%7B%22test%22%3Atrue%7D`;
const user = (id, name) => ({ data: { user: { result: { __typename: "User", rest_id: id, legacy: { screen_name: name } } } } });

function injected(h) {
  let body;
  const emitted = [];
  const pageWindow = { location: window.location, fetch: async () => ({ headers: { get: () => "application/json" }, clone: () => ({ json: async () => body }) }) };
  class XHR {
    listeners = new Map();
    open() {}
    send() { this.listeners.get("load")?.(); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    getResponseHeader() { return "application/json"; }
  }
  vm.runInNewContext(readFileSync(new URL("../extension/injected.js", import.meta.url), "utf8"), {
    window: pageWindow, XMLHttpRequest: XHR,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    document: { dispatchEvent: event => { emitted.push(event); h.events.get(event.type)?.(event); } },
  });
  return {
    emitted,
    async fetch(json, url = "https://x.com/i/api/graphql/dynamic-query/UserByScreenName") {
      body = json;
      await pageWindow.fetch(url);
      await new Promise(resolve => setImmediate(resolve));
    },
    xhr(json, url, responseType = "") {
      const xhr = new XHR();
      xhr.responseType = responseType;
      if (responseType === "json") xhr.response = json;
      else xhr.responseText = JSON.stringify(json);
      xhr.open("GET", url);
      xhr.send();
    },
  };
}

test("unverified user IDs are never treated as belonging to the current profile", async () => {
  const h = await coreHarness();
  try {
    const { findApiTemplate } = await h.load("core/api.ts");
    h.events.get("xmd-api-template")({ detail: { url: template("111") } });
    assert.equal(findApiTemplate(), null);
  } finally { await h.close(); }
});

test("SPA navigation rejects another author's cached template and late responses", async () => {
  const h = await coreHarness();
  try {
    const { findApiTemplate } = await h.load("core/api.ts");
    const hook = injected(h);
    await hook.fetch(user("111", "Alice"), template("111"));
    assert.equal(findApiTemplate()?.userId, "111");
    window.location.pathname = "/bob/media";
    assert.equal(findApiTemplate(), null);
    await hook.fetch(user("111", "Alice"), template("111")); // old response arriving on Bob's route
    assert.equal(findApiTemplate(), null);
    await hook.fetch(user("222", "BOB"), template("222"));
    assert.equal(findApiTemplate()?.userId, "222");
    assert.equal(findApiTemplate("aLiCe")?.userId, "111");
  } finally { await h.close(); }
});

test("a newer unrelated request cannot replace the verified profile's template", async () => {
  const h = await coreHarness();
  try {
    const { findApiTemplate } = await h.load("core/api.ts");
    const hook = injected(h);
    await hook.fetch(user("111", "Alice"), template("111"));
    await hook.fetch(user("222", "Bob"), template("222"));
    assert.equal(findApiTemplate()?.userId, "111");
    window.location.pathname = "/home";
    assert.equal(findApiTemplate(), null);
  } finally { await h.close(); }
});

test("resource timing fallback still works after the author's identity is verified", async () => {
  const h = await coreHarness();
  const originalPerformance = globalThis.performance;
  try {
    globalThis.performance = { getEntriesByType: () => [{ name: template("111") }, { name: template("222") }] };
    const { findApiTemplate } = await h.load("core/api.ts");
    await injected(h).fetch(user("111", "alice"));
    assert.equal(findApiTemplate()?.userId, "111");
    assert.equal(findApiTemplate()?.features, '{"test":true}');
  } finally { globalThis.performance = originalPerformance; await h.close(); }
});

test("XHR JSON responses provide modern user identities without losing video mappings", async () => {
  const h = await coreHarness();
  try {
    const { findApiTemplate } = await h.load("core/api.ts");
    const hook = injected(h);
    hook.xhr({ data: { user: { result: { __typename: "User", rest_id: "111", core: { screen_name: "alice" },
      legacy: { extended_entities: { media: [{ media_url_https: "https://pbs.twimg.com/poster.jpg", video_info: { variants: [{ content_type: "video/mp4", bitrate: 100, url: "https://video.twimg.com/test.mp4" }] } }] } } } } } }, template("111"), "json");
    assert.equal(findApiTemplate()?.userId, "111");
    assert.ok(hook.emitted.some(event => event.type === "xmd-video-map"));
    assert.ok(hook.emitted.some(event => event.type === "xmd-api-user"));
  } finally { await h.close(); }
});
