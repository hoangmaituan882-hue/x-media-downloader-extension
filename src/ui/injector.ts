// 页内媒体 hover 下载按钮 + 右键菜单消息处理。
// v7.5.1：改为「事件委托 + 单一 fixed 按钮」。旧实现往 React 管理的
// tweetPhoto/videoPlayer 里 appendChild，破坏 X 的 React 协调，导致刷帖时图片白屏。
// 现在不再触碰 React 的 DOM 树，只在 document.body 挂一个跟随按钮。

import { useXmd } from "../core/engine";
import { extractTweetMeta, extractTweetTime } from "../core/scanner";
import { getPageContext } from "../core/page";
import { getBestUrl, mediaKey } from "../core/utils";
import { hasRecord } from "../core/store";
import { flyToOrb } from "./flyToOrb";
import type { MediaType, SingleInput } from "../core/single-types";

const STYLE_ID = "xmd-media-dl-styles";

// 与 X 媒体控件相同尺寸的向下下载图标。
const DL_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></svg>';

// transitions.dev Pattern 10: 矢量描边手绘勾选图标
const CHECK_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="xmd-check-path" d="M5 13l4 4L19 7"/></svg>';
const SPINNER_SVG = '<svg class="xmd-media-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9"/></svg>';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    /* transitions.dev card-resize：同一表面从圆形拉伸为胶囊，右侧锚点不动。 */
    .t-resize {
      transition:
        width var(--resize-dur) var(--resize-ease),
        height var(--resize-dur) var(--resize-ease);
      will-change: width, height;
    }
    .xmd-media-dl {
      --resize-dur: 150ms;
      --resize-ease: cubic-bezier(0.22, 1, 0.36, 1);
      position: fixed !important;
      z-index: 2147483000 !important;
      width: 32px !important;
      height: 32px !important;
      padding: 0 !important;
      border: none !important;
      outline: none !important;
      overflow: hidden !important;
      border-radius: 9999px !important;
      background: rgba(15, 20, 25, 0.82) !important;
      color: #ffffff !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      backdrop-filter: blur(4px) !important;
      -webkit-backdrop-filter: blur(4px) !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35) !important;
      margin: 0 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      line-height: 20px !important;
      -webkit-font-smoothing: antialiased !important;
      opacity: 0;
      transform: scale(0.98);
      pointer-events: none;
      transition: width var(--resize-dur) var(--resize-ease), height var(--resize-dur) var(--resize-ease), opacity 150ms var(--resize-ease), transform 150ms var(--resize-ease), background-color 150ms var(--resize-ease) !important;
      user-select: none !important;
      -webkit-user-select: none !important;
    }
    .xmd-media-dl.is-visible {
      opacity: 1 !important;
      transform: scale(1) !important;
      pointer-events: auto;
    }
    .xmd-media-dl:is(:hover, :focus-visible) {
      --resize-dur: 250ms;
      width: 104px !important;
      background: rgba(39, 44, 48, 0.94) !important;
    }
    .xmd-media-dl:focus-visible {
      outline: 2px solid #ffffff !important;
      outline-offset: 2px !important;
    }
    .xmd-media-dl:active:not(:disabled) {
      background: rgba(0, 0, 0, 0.98) !important;
      transform: scale(0.98) !important;
    }
    .xmd-media-dl:disabled { cursor: default !important; }
    .xmd-media-icon, .xmd-media-label {
      position: absolute !important;
      display: grid !important;
      place-items: center !important;
      pointer-events: none !important;
      transition: opacity 150ms var(--resize-ease), transform 250ms var(--resize-ease), filter 150ms var(--resize-ease) !important;
    }
    .xmd-media-icon { right: 7px !important; width: 18px !important; height: 18px !important; }
    .xmd-media-label {
      inset: 0 !important;
      white-space: nowrap !important;
      opacity: 0;
      transform: translateX(4px) scale(0.98);
      filter: blur(2px);
    }
    .xmd-media-dl:is(:hover, :focus-visible) .xmd-media-icon {
      opacity: 0; transform: translateX(-4px) scale(0.98); filter: blur(2px);
    }
    .xmd-media-dl:is(:hover, :focus-visible) .xmd-media-label {
      opacity: 1; transform: translateX(0) scale(1); filter: blur(0);
    }
    .xmd-media-dl svg {
      width: 18px !important;
      height: 18px !important;
      display: block !important;
      pointer-events: none !important;
    }

    /* Pattern 10: 动态手绘勾选描边 */
    .xmd-check-path {
      stroke-dasharray: var(--xmd-check-length, 24);
      stroke-dashoffset: var(--xmd-check-length, 24);
      animation: xmd-check-draw 250ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes xmd-check-draw {
      to { stroke-dashoffset: 0; }
    }

    .xmd-media-spinner { animation: xmd-media-spin 1s linear infinite; }
    @keyframes xmd-media-spin { to { transform: rotate(360deg); } }

    @media (prefers-reduced-motion: reduce) {
      .t-resize, .xmd-media-dl, .xmd-media-icon, .xmd-media-label, .xmd-check-path, .xmd-media-spinner {
        transition: none !important;
        animation: none !important;
        stroke-dashoffset: 0 !important;
      }
    }
  `;
  document.head.appendChild(el);
}

function inExtension(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
}

function pickMedia(container: Element): { type: MediaType; url: string; thumbnail: string } | null {
  const video = container.tagName === "VIDEO" ? (container as HTMLVideoElement) : container.querySelector("video");
  if (video) {
    // X 的视频多为 MSE 流（video.src 是 blob:），blob 链接后台下载不了；
    // 优先取 <source> 里的真实 http mp4（按 size 属性取最大码率），blob 仅兜底
    const sources = Array.from(video.querySelectorAll("source"));
    const real = sources
      .filter(s => /^https?:/i.test(s.src))
      .sort((a, b) => (parseInt(b.getAttribute("size") || "0") - parseInt(a.getAttribute("size") || "0")));
    const src = real[0]?.src || video.src || video.currentSrc;
    if (src) return { type: "video", url: src, thumbnail: video.poster || "" };
  }
  const img = container.tagName === "IMG" ? (container as HTMLImageElement) : container.querySelector("img");
  if (img) {
    const src = img.src || img.currentSrc;
    const best = getBestUrl(src);
    if (best) return { type: "image", url: best, thumbnail: src };
  }
  return null;
}

function buildInput(container: Element): SingleInput | null {
  const media = pickMedia(container);
  if (!media) return null;
  const meta = extractTweetMeta(container);
  const pageCtx = getPageContext();
  const pageUser =
    pageCtx.type === "profile_media" || pageCtx.type === "profile_home" ? pageCtx.username : undefined;
  return {
    url: media.url,
    type: media.type,
    thumbnail: media.thumbnail,
    username: meta.username || pageUser,
    tweetId: meta.tweetId || (pageCtx.type === "single_tweet" ? pageCtx.tweetId : undefined),
    tweetTime: extractTweetTime(container),
    avatar: meta.avatar,
    tweetText: meta.tweetText,
  };
}

function onMediaClick(container: Element): void {
  const st = useXmd.getState();
  const input = buildInput(container);
  if (!input) return;
  if (st.settings.inline.clickAction === "queue") st.enqueueExternal(input);
  else void st.downloadSingle(input);
}

/** 右键菜单：按 srcUrl 找回页面里的媒体元素，复用同一下载链路 */
function handleContextDownload(srcUrl: string): void {
  const st = useXmd.getState();
  if (!st.settings.inline.enabled || !st.settings.inline.contextMenu) return;

  const base = srcUrl.split("?")[0];
  const file = base.split("/").pop() || "";
  const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
  const hit =
    imgs.find(i => (i.src || "").split("?")[0] === base) ||
    imgs.find(i => i.src.includes("twimg") && file && i.src.includes(file));

  if (hit) {
    const container = hit.closest('[data-testid="tweetPhoto"]') || hit.parentElement;
    if (container) {
      void st.downloadSingle(buildInput(container) ?? {
        url: getBestUrl(srcUrl)!, type: "image", thumbnail: srcUrl, tweetTime: extractTweetTime(container),
      });
      return;
    }
  }
  // 页面里找不到对应元素（如已滚出虚拟列表）：仅用 URL 直下
  void st.downloadSingle({ url: getBestUrl(srcUrl)!, type: "image", thumbnail: srcUrl, tweetTime: null });
}

/** 事件委托：挂一个 fixed 按钮跟随 hover 的媒体，用 rAF 逐帧定位跟随图片滚动，绝不往 React 节点里插入元素 */
function startDelegated(): void {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "xmd-media-dl t-resize";
  btn.setAttribute("aria-label", "下载原图");
  const icon = document.createElement("span");
  icon.className = "xmd-media-icon";
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "xmd-media-label";
  label.setAttribute("aria-hidden", "true");
  btn.append(icon, label);
  btn.style.setProperty("display", "none", "important");
  document.body.appendChild(btn);

  let current: Element | null = null;
  let fingerprint = ""; // hover 媒体的指纹：图片 src / 视频 poster 去 query
  let raf = 0;
  let hideTimer = 0;
  const paintState = () => {
    if (!current) return;
    const media = pickMedia(current);
    if (!media) return;
    const key = mediaKey(media.url);
    const state = useXmd.getState();
    const item = state.items.find(it => mediaKey(it.url) === key);
    const saved = hasRecord(key) || item?.status === "done";
    const loading = item?.status === "loading";
    const queued = state.settings.inline.clickAction === "queue" && !!item;
    const text = saved ? "已下载" : loading ? "下载中" : queued ? "已加入队列" : media.type === "video" ? "下载视频" : "下载原图";
    label.textContent = text;
    btn.setAttribute("aria-label", text);
    btn.setAttribute("aria-busy", String(loading));
    btn.disabled = saved || loading || queued;
    const iconState = saved ? "saved" : loading ? "loading" : "idle";
    if (btn.dataset.state !== iconState) {
      btn.dataset.state = iconState;
      icon.innerHTML = saved ? CHECK_SVG : loading ? SPINNER_SVG : DL_SVG;
      const path = icon.querySelector<SVGPathElement>(".xmd-check-path");
      if (path) path.style.setProperty("--xmd-check-length", String(Math.ceil(path.getTotalLength()) + 1));
    }
  };

  // 提取媒体指纹：虚拟列表会复用 DOM 元素显示别的推文，指纹不一致说明 hover 的媒体已被替换
  const fingerprintOf = (el: Element): string => {
    const img = el.tagName === "IMG" ? (el as HTMLImageElement) : el.querySelector("img");
    if (img) return (img.src || img.currentSrc || "").split("?")[0];
    const video = el.tagName === "VIDEO" ? (el as HTMLVideoElement) : el.querySelector("video");
    if (video) return ((video as HTMLVideoElement).poster || "").split("?")[0];
    return "";
  };

  const hide = () => {
    current = null;
    fingerprint = "";
    btn.classList.remove("is-visible");
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    // 关闭比展开更快，退场后再移除命中区域。
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!current) {
        btn.style.setProperty("display", "none", "important");
      }
    }, 150);
  };

  const reposition = () => {
    if (!current || !current.isConnected) { hide(); return; }
    // 元素被复用（内容换成别的推文）→ 隐藏，避免按钮漂移到别的图片上
    if (fingerprint && fingerprintOf(current) !== fingerprint) { hide(); return; }
    const r = current.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { hide(); return; }
    // 图片完全滚出视口 → 隐藏按钮（不再 clamp 到屏幕边缘，避免按钮「固定」在屏幕上）
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
      hide();
      return;
    }
    const btnTop = r.top + 10;
    // 固定右侧锚点，胶囊向左生长，不在每一帧追着变化的宽度移动。
    btn.style.right = `${window.innerWidth - r.right + 10}px`;
    btn.style.top = `${btnTop}px`;
    btn.style.setProperty("display", "flex", "important");

    // 确保添加到 DOM 后顺畅播放缩放淡入动画
    requestAnimationFrame(() => {
      if (current) btn.classList.add("is-visible");
    });
  };

  // rAF 逐帧跟随：图片随滚动/布局移动时按钮同步贴在图片右上角
  const loop = () => {
    if (!current) { raf = 0; return; } // 已隐藏则停止循环，避免空转
    reposition();
    if (!current) { raf = 0; return; } // reposition 内触发了 hide → 停止循环
    raf = requestAnimationFrame(loop);
  };

  const show = (el: Element) => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }
    current = el;
    fingerprint = fingerprintOf(el);
    paintState();
    reposition();
    if (!raf) raf = requestAnimationFrame(loop);
  };

  document.addEventListener("mouseover", e => {
    const target = e.target as Element | null;
    if (!target || target === btn || btn.contains(target)) return; // 悬停在按钮上保持
    const st = useXmd.getState();
    if (!st.settings.inline.enabled) { hide(); return; }
    // 播放器覆盖层和图片点击层会截获鼠标；从最近的媒体容器取实际媒体。
    const media = typeof target.closest === "function" ? (
      target.closest("video") ||
      target.closest('[data-testid="videoPlayer"], [data-testid="videoComponent"]')?.querySelector("video") ||
      target.closest("img") ||
      target.closest('[data-testid="tweetPhoto"]')?.querySelector("img")
    ) : null;
    let isMedia = false;
    if (media) {
      if (media.tagName === "IMG") {
        // 只认正文图片，过滤头像 / 视频封面缩略图
        isMedia = (media as HTMLImageElement).src.includes("pbs.twimg.com/media/");
      } else if (media.tagName === "VIDEO") {
        isMedia = st.settings.inline.onVideos;
      }
    }
    if (media && isMedia) show(media);
    else if (st.settings.inline.hoverOnly) hide();
  });

  document.addEventListener("mouseout", e => { if (!e.relatedTarget) hide(); });
  useXmd.subscribe(state => {
    if (!current) return;
    const media = pickMedia(current);
    if (!state.settings.inline.enabled || (media?.type === "video" && !state.settings.inline.onVideos)) hide();
    else paintState();
  });

  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (current) {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        flyToOrb({ startRect: btn.getBoundingClientRect() });
      }
      onMediaClick(current);
    }
  });
}

export function initMediaButtons(): void {
  ensureStyles();

  if (inExtension()) {
    chrome.runtime.onMessage.addListener(msg => {
      if (msg?.type === "xmd-context-download" && msg.srcUrl) handleContextDownload(msg.srcUrl);
    });
  }

  if (!useXmd.getState().settings.inline.enabled) {
    // 设置里开启后再启动
    const unsub = useXmd.subscribe((s, prev) => {
      if (s.settings.inline.enabled && prev && !prev.settings.inline.enabled) {
        unsub();
        startDelegated();
      }
    });
    return;
  }
  startDelegated();
}
