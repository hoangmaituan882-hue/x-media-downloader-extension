// 内容脚本入口：Shadow DOM 挂载 React 应用。
// 宿主覆盖整个视口但 pointer-events:none，面板自身恢复交互，
// 这样 Motion 拖拽约束可以直接用宿主元素作为视口边界。
//
// 样式以独立资源文件随扩展分发，运行时 fetch 后注入 Shadow Root。
// （不能用 ?inline：Tailwind v4 的 vite 插件对 ?inline 模块的编译结果
//   冻结在首次 transform，扫描到的候选类进不来，见 v7.3.1 修复记录）

import { createRoot } from "react-dom/client";
import "./styles.css"; // 副作用导入：让 Vite 产出 styles.css 资产，运行时 fetch 注入
import { App } from "./ui/App";
import { initInlineButton } from "./ui/inline";
import { initMediaButtons } from "./ui/injector";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { PUSH_KEY, useXmd } from "./core/engine";
import { initStores, storeSize } from "./core/store";
import { loadSettings, onSettingsChanged } from "./core/settings";
import { getPageContext } from "./core/page";
import { installVideoResolver, injectVideoHook } from "./core/video-resolver";

function inExtension(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
}

import { applyThemeClass } from "./core/theme";

async function loadStyles(): Promise<string> {
  const url = inExtension()
    ? chrome.runtime.getURL("styles.css")
    : new URL("styles.css", document.baseURI).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

(() => {
  if ((window as any).__XMD_EXT_LOADED__) return;
  (window as any).__XMD_EXT_LOADED__ = true;

  // 尽早安装视频 URL 解析并注入拦截脚本（截获后续 GraphQL 响应里的真实 mp4）
  installVideoResolver();
  injectVideoHook();

  async function boot() {
    let css = "";
    try {
      css = await loadStyles();
    } catch (e) {
      console.error("[XMD] 样式加载失败:", e);
    }

    const host = document.createElement("div");
    host.id = "xmd-host";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const styleEl = document.createElement("style");
    styleEl.textContent = css;
    shadow.appendChild(styleEl);

    const rootEl = document.createElement("div");
    rootEl.id = "xmd-root";
    shadow.appendChild(rootEl);

    // 存储水合（chrome.storage.local / localStorage 回退）+ 设置订阅
    await initStores();
    useXmd.setState({ settings: await loadSettings(), storeCount: storeSize() });
    onSettingsChanged(next => useXmd.setState({ settings: next }));
    // 深链：#xmd-settings / #xmd-history / #xmd-about 直接打开对应视图（调试/快捷入口）
    if (location.hash === "#xmd-settings") useXmd.setState({ view: "settings" });
    if (location.hash === "#xmd-history") useXmd.setState({ view: "history" });
    if (location.hash === "#xmd-about") useXmd.setState({ view: "about" });
    if (location.hash === "#xmd-demo") {
      setTimeout(() => useXmd.getState().startDemo(), 900);
    }

    // 推送下载跨跳转意图：跳转后落在该博主媒体页 → 自动跑完整链路
    const checkPushIntent = () => {
      const pushUser = sessionStorage.getItem(PUSH_KEY);
      if (!pushUser) return false;
      const pctx = getPageContext();
      if (
        pctx.type === "profile_media" &&
        pctx.username &&
        pctx.username.toLowerCase() === pushUser.toLowerCase()
      ) {
        sessionStorage.removeItem(PUSH_KEY);
        setTimeout(() => {
          void useXmd.getState().runPushPipeline();
        }, 1200);
        return true;
      }
      return false;
    };

    if (sessionStorage.getItem(PUSH_KEY)) {
      if (!checkPushIntent()) {
        let pollCount = 0;
        const pushPollTimer = setInterval(() => {
          pollCount++;
          if (checkPushIntent() || pollCount >= 12 || !sessionStorage.getItem(PUSH_KEY)) {
            clearInterval(pushPollTimer);
          }
        }, 350);
      }
    }

    // 标题栏进度：标签切后台也能瞟到；完成闪 ✅ 三秒还原
    const baseTitle = document.title;
    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    useXmd.subscribe((s, prev) => {
      const busyNow = s.isDownloading || s.pushActive;
      const busyPrev = prev && (prev.isDownloading || prev.pushActive);
      if (busyNow) {
        if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
        document.title = s.isDownloading
          ? `⬇ ${s.dlDone}/${s.dlTotal} · X Media`
          : `⬇ 加载 ${s.items.length} · X Media`;
      } else if (busyPrev) {
        document.title = `✅ ${s.completedCount} · X Media`;
        flashTimer = setTimeout(() => {
          document.title = baseTitle;
          flashTimer = null;
        }, 3000);
      }
    });

    // 暗黑模式：检测 + 轮询跟随 X 主题切换
    // root/host dataset 供 shadow 内组件；html.xmd-dark 类供页内注入按钮
    const applyTheme = () => {
      const t = applyThemeClass();
      rootEl.dataset.theme = t;
      host.dataset.theme = t;
    };
    applyTheme();
    setInterval(applyTheme, 3000);

    createRoot(rootEl).render(
      <ErrorBoundary label="面板">
        <App host={host} />
      </ErrorBoundary>,
    );
    initInlineButton();
    initMediaButtons();
    console.log("[XMD] v7.4 React UI 已启动");
  }

  // 扩展消息：图标点击展开面板 / 后台订阅触发的推送管线（回包完成数）
  if (inExtension()) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.type === "xmd-show-panel") {
        useXmd.setState({ collapsed: false });
        return false;
      }
      if (msg?.type === "xmd-run-push") {
        void useXmd
          .getState()
          .runPushPipeline()
          .then(n => sendResponse({ ok: true, count: n }));
        return true; // 异步回包
      }
      return false;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void boot(); }, { once: true });
  } else {
    void boot();
  }
})();
