import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { App } from "../src/ui/App";
import { useXmd } from "../src/core/engine";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { MediaItem } from "../src/core/types";

const items: MediaItem[] = Array.from({ length: 16 }, (_, index) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="hsl(${index * 31},65%,65%)"/><text x="80" y="95" text-anchor="middle" font-size="42">${index + 1}</text></svg>`;
  const thumbnail = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return {
    id: `fixture-${index}`, type: index === 1 ? "video" : "image",
    url: thumbnail, thumbnail, fileName: `media-${index + 1}.jpg`,
    status: "pending", source: "api", selected: index % 3 === 0,
    username: index < 8 ? "alice" : "bob",
    tweetId: `100${Math.floor(index / 4)}`,
    tweetTime: new Date("2026-10-14T12:00:00+08:00"),
  };
});

localStorage.removeItem("xmd_panel_pos");
useXmd.setState({
  items, mediaView: "list", view: "main", collapsed: false,
  settings: { ...structuredClone(DEFAULT_SETTINGS), float: { enabled: false, showPending: false } },
});

const host = document.createElement("div");
host.id = "xmd-host";
host.style.cssText = "position:fixed;inset:0;pointer-events:none";
document.body.appendChild(host);
const shadow = host.attachShadow({ mode: "open" });
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/src/styles.css?direct";
shadow.appendChild(stylesheet);
const root = document.createElement("div");
root.id = "xmd-root";
root.dataset.theme = new URLSearchParams(location.search).get("theme") || "light";
host.dataset.theme = root.dataset.theme;
shadow.appendChild(root);

(window as any).mediaViewFixture = {
  store: useXmd, items,
  setState: (state: Parameters<typeof useXmd.setState>[0]) => flushSync(() => useXmd.setState(state)),
  setView: (view: "list" | "card" | "tweet" | "pack") => flushSync(() => useXmd.getState().setMediaView(view)),
};
createRoot(root).render(<App host={host} />);
