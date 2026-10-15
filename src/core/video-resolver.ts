// 视频真实 mp4 URL 解析。
// X 的视频在 DOM 里是 MSE blob: 流（fetch 不到、chrome.downloads 也不认），
// 但真实 mp4 在 GraphQL 响应的 video_info.variants 里，且 video.twimg.com 是 CORS 开放的。
// 因此往页面（主 world）注入 injected.js 拦截 GraphQL 响应，把 posterUrl → mp4Url
// 映射经 CustomEvent 传回，下载 blob 视频时据此换成真实 mp4 URL。

const videoMap = new Map<string, string>();
const VIDEO_MAP_MAX = 500;
let installed = false;

/** 安装事件监听：接收页面注入脚本发来的 posterUrl → mp4Url 映射 */
export function installVideoResolver(): void {
  if (installed) return;
  installed = true;
  document.addEventListener("xmd-video-map", e => {
    const d = (e as CustomEvent).detail as { poster?: string; mp4?: string } | undefined;
    if (!d?.poster || !d?.mp4) return;
    videoMap.set(d.poster, d.mp4);
    // 防无限增长：超上限删除最早插入的条目
    if (videoMap.size > VIDEO_MAP_MAX) {
      const oldest = videoMap.keys().next().value;
      if (oldest) videoMap.delete(oldest);
    }
  });
}

/** 向页面注入拦截脚本（web_accessible_resource，CSP 不会拦） */
export function injectVideoHook(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
  if (document.getElementById("xmd-video-hook")) return;
  const s = document.createElement("script");
  s.id = "xmd-video-hook";
  s.src = chrome.runtime.getURL("injected.js");
  (document.head || document.documentElement).appendChild(s);
}

/** 若为 blob/data 视频且能解析出真实 mp4，返回真实 URL；否则原样返回 */
export function resolveVideoUrl(url: string, poster: string): string {
  if (!/^(blob:|data:)/i.test(url)) return url;
  if (!poster) return url;
  const mp4 = videoMap.get(poster.split("?")[0]);
  return mp4 || url;
}
