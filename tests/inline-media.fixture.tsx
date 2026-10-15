import { createRoot } from "react-dom/client";
import { App } from "../src/ui/App";
import { initMediaButtons } from "../src/ui/injector";
import { useXmd } from "../src/core/engine";
import { initStores } from "../src/core/store";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { installVideoResolver } from "../src/core/video-resolver";

const requests: { message: any; reply: (result: any) => void }[] = [];
const storage: Record<string, string> = {};
(window as any).chrome.runtime = { id: "inline-regression", onMessage: { addListener() {} },
  sendMessage: (message: any, reply: (result: any) => void) => requests.push({ message, reply }) };
(window as any).chrome.storage = { local: {
  get: async (key: string) => ({ [key]: storage[key] }),
  set: async (values: Record<string, string>) => Object.assign(storage, values),
} };
await initStores();
useXmd.setState({ items: [], collapsed: false, view: "main", mediaView: "list", toast() {},
  settings: { ...structuredClone(DEFAULT_SETTINGS), float: { enabled: false, showPending: false } } });

const canvas = document.createElement("canvas");
canvas.width = 320; canvas.height = 180;
const ctx = canvas.getContext("2d")!;
ctx.fillStyle = "#8f93d1"; ctx.fillRect(0, 0, 320, 180);
const stream = canvas.captureStream(10);
const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
const chunks: Blob[] = [];
recorder.ondataavailable = event => chunks.push(event.data);
await new Promise<void>(resolve => {
  recorder.onstop = () => resolve();
  recorder.start();
  setTimeout(() => recorder.stop(), 150);
});
stream.getTracks().forEach(track => track.stop());
const video = document.querySelector<HTMLVideoElement>("#playing-video")!;
video.src = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
installVideoResolver();
document.dispatchEvent(new CustomEvent("xmd-video-map", { detail: { poster: video.poster, mp4: "https://video.twimg.com/inline-regression.mp4" } }));

const host = document.createElement("div");
host.id = "xmd-host";
host.style.cssText = "position:fixed;inset:0;pointer-events:none";
document.body.appendChild(host);
const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("link");
style.rel = "stylesheet"; style.href = "/src/styles.css?direct";
shadow.appendChild(style);
const root = document.createElement("div");
root.id = "xmd-root";
shadow.appendChild(root);
createRoot(root).render(<App host={host} />);
initMediaButtons();
(window as any).inlineFixture = {
  store: useXmd,
  requests,
  complete: (ok = true) => requests.splice(0).forEach(request => request.reply({ ok, bytes: 12, error: ok ? undefined : "NETWORK_FAILED" })),
};
