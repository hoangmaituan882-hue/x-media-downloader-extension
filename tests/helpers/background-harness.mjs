import vm from "node:vm";
import { readFileSync } from "node:fs";

export function event() {
  const listeners = new Set();
  return {
    addListener: fn => listeners.add(fn),
    removeListener: fn => listeners.delete(fn),
    emit: (...args) => [...listeners].map(fn => fn(...args)),
    get size() { return listeners.size; },
  };
}

export function backgroundHarness(options = {}) {
  const messages = event(), connects = event(), changes = event();
  const timers = [];
  const chrome = {
    action: { onClicked: event() },
    runtime: { onMessage: messages, onConnect: connects, onInstalled: event(), onStartup: event() },
    contextMenus: { onClicked: event() },
    alarms: { onAlarm: event() },
    notifications: { onClicked: event() },
    downloads: {
      download: (_opts, cb) => cb(7),
      onChanged: changes,
      search: (_query, cb) => cb([options.item ?? { id: 7, state: "in_progress", fileSize: -1 }]),
      ...options.downloads,
    },
  };
  vm.runInNewContext(readFileSync(new URL("../../extension/background.js", import.meta.url), "utf8"), {
    chrome, console, fetch: options.fetch ?? fetch,
    AbortController, Uint8Array, btoa,
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimeout: timer => { timer.cancelled = true; },
  });
  return { chrome, changes, timers,
    send(message) {
      const replies = [];
      messages.emit(message, {}, reply => replies.push(JSON.parse(JSON.stringify(reply))));
      return replies;
    },
    connectClient() {
      const client = { name: "xmd-download", onMessage: event(), onDisconnect: event(), disconnected: false };
      const worker = { name: client.name, onMessage: event(), onDisconnect: event() };
      const wire = message => JSON.parse(JSON.stringify(message)); // Chrome runtime messaging uses JSON.
      client.postMessage = msg => queueMicrotask(() => worker.onMessage.emit(wire(msg)));
      worker.postMessage = msg => queueMicrotask(() => client.onMessage.emit(wire(msg)));
      client.disconnect = () => {
        client.disconnected = true;
        worker.onDisconnect.emit();
        client.onDisconnect.emit();
      };
      connects.emit(worker);
      return client;
    },
  };
}
