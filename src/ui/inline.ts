// 页面内联「批量下载」按钮（轻 DOM，直接注入页面而非 Shadow Root，
// 因为它需要出现在 X 的资料页标题行内）。

import { getPageContext } from "@/core/page";
import { useXmd } from "@/core/engine";

const STYLE_ID = "xmd-inline-styles";
const DL_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

let countSubscribed = false;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    /* Modern (transitions.dev) 规范：中性表面、层叠阴影、同心胶囊圆角、触压缩放 */
    .xmd-inline-btn {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      height: 36px !important;
      padding: 0 14px 0 12px !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      border: none !important;
      border-radius: 40px !important;
      background: #ffffff !important;
      color: #0d0d0d !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 1px 3px 0 rgba(0,0,0,.04) !important;
      cursor: pointer !important;
      transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 150ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms cubic-bezier(0.22, 1, 0.36, 1) !important;
      vertical-align: middle !important;
      margin-left: 10px !important;
      font-family: inherit !important;
      line-height: 20px !important;
      width: auto !important;
      position: static !important;
      opacity: 1 !important;
      -webkit-font-smoothing: antialiased !important;
    }
    .xmd-inline-btn:hover {
      background: #f9f9f9 !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,.12), 0 4px 14px rgba(0,0,0,.06) !important;
    }
    .xmd-inline-btn:active {
      transform: scale(0.97) !important;
    }
    /* 暗色主题：静默深色表面与发丝微光 */
    html.xmd-dark .xmd-inline-btn {
      background: #1d1d1d !important;
      color: #f2f2f2 !important;
      box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 1px 3px 0 rgba(0,0,0,.2) !important;
    }
    html.xmd-dark .xmd-inline-btn:hover {
      background: #252525 !important;
      box-shadow: 0 0 0 1px rgba(255,255,255,.14), 0 4px 14px rgba(0,0,0,.4) !important;
    }
    .xmd-inline-btn svg {
      flex-shrink: 0;
      width: 15px !important;
      height: 15px !important;
      stroke-width: 1.5 !important;
    }
    .xmd-inline-btn span {
      display: inline !important;
    }
    .xmd-inline-count {
      font-size: 11px !important;
      font-weight: 500 !important;
      padding: 1px 7px !important;
      border-radius: 999px !important;
      background: rgba(0, 115, 229, 0.08) !important;
      color: rgba(0, 83, 227, 0.9) !important;
      margin-left: 2px !important;
      font-variant-numeric: tabular-nums !important;
    }
    html.xmd-dark .xmd-inline-count {
      background: rgba(0, 115, 229, 0.18) !important;
      color: #7aa8ff !important;
    }
  `;
  document.head.appendChild(el);
}

export function initInlineButton() {
  ensureStyles();
  injectInlineButton();

  // SPA 路由自适应：切换页面后重新注入
  let lastRoute = location.pathname + location.search;
  setInterval(() => {
    const cur = location.pathname + location.search;
    if (cur !== lastRoute) {
      lastRoute = cur;
      injectInlineButton();
    }
  }, 1200);
}

function injectInlineButton() {
  const ctx = getPageContext();
  if (ctx.type !== "profile_media" && ctx.type !== "profile_home") return;
  if (document.getElementById("xmd-inline-download")) return;

  // 策略1：选中状态的媒体 Tab
  const selectedTab = document.querySelector('[data-testid="TabBar"] [role="tab"][selected]');
  if (selectedTab && selectedTab.textContent?.includes("媒体")) {
    const row = selectedTab.closest("div");
    if (row) return injectBtn(row as HTMLElement);
  }

  // 策略2：包含「张照片和视频」的文本节点
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n =>
      n.textContent?.includes("张照片和视频") || n.textContent?.includes("photos and videos")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.parentElement) return injectBtn(node.parentElement);
  }
}

function injectBtn(target: HTMLElement) {
  const btn = document.createElement("button");
  btn.id = "xmd-inline-download";
  btn.className = "xmd-inline-btn";
  btn.innerHTML = `${DL_ICON}<span>批量下载</span><span class="xmd-inline-count" id="xmd-inline-count"></span>`;
  btn.title = "打开 X 媒体下载器面板";
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    useXmd.setState({ collapsed: false });
    useXmd.getState().scan();
  });
  target.style.display = "inline-flex";
  target.style.alignItems = "center";
  target.appendChild(btn);

  if (!countSubscribed) {
    countSubscribed = true;
    useXmd.subscribe(state => {
      const cnt = document.getElementById("xmd-inline-count");
      if (cnt) cnt.textContent = state.items.length > 0 ? ` ${state.items.length}` : "";
    });
  }
}
