import { createServer } from "vite";
import { fileURLToPath } from "node:url";

export async function coreHarness(seed = {}, extension = true) {
  const stored = structuredClone(seed);
  const reads = [];
  const events = new Map();
  const local = new Map(Object.entries(seed));
  globalThis.localStorage = {
    getItem: key => local.get(key) ?? null,
    setItem: (key, value) => local.set(key, value),
  };
  globalThis.window = { location: { pathname: "/alice/media", search: "", origin: "https://x.com" } };
  globalThis.location = window.location;
  globalThis.document = { cookie: "", addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.chrome = extension ? {
    runtime: { id: "isolated-test" },
    storage: { local: {
      get: async key => { reads.push(key); return { [key]: stored[key] }; },
      set: async values => { Object.assign(stored, values); },
    } },
  } : undefined;
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const server = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  return {
    stored, reads, events, local,
    load: name => server.ssrLoadModule(`/src/${name}`),
    async close() {
      // Persistence is debounced. Finish this context's writes before the next test.
      await new Promise(resolve => setTimeout(resolve, 850));
      await server.close();
    },
  };
}
