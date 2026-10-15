// X Media Downloader — 页面上下文注入脚本（主 world，web_accessible_resource）
// 职责：拦截 X 的 GraphQL 响应，提取视频真实 mp4 URL。
// 背景：X 的视频在 DOM 里是 MSE blob: 流（fetch 不到、chrome.downloads 不认），
// 但真实 mp4 在响应 video_info.variants 里，且 video.twimg.com 是 CORS 开放的。
// 这里把 posterUrl → mp4Url 映射经 CustomEvent 传回内容脚本。
(() => {
  if (window.__XMD_VIDEO_HOOK__) return;
  window.__XMD_VIDEO_HOOK__ = true;

  const emit = (poster, mp4) => {
    try {
      document.dispatchEvent(new CustomEvent("xmd-video-map", { detail: { poster, mp4 } }));
    } catch { /* ignore */ }
  };

  const bestMp4 = variants => {
    if (!Array.isArray(variants)) return null;
    let best = null;
    let bestBr = -1;
    for (const v of variants) {
      if (v && v.content_type === "video/mp4" && typeof v.url === "string" && (v.bitrate || 0) > bestBr) {
        best = v.url;
        bestBr = v.bitrate || 0;
      }
    }
    return best;
  };

  const scanMedia = media => {
    if (!Array.isArray(media)) return;
    for (const m of media) {
      if (!m) continue;
      const mp4 = bestMp4(m.video_info && m.video_info.variants);
      if (mp4 && m.media_url_https) emit(m.media_url_https.split("?")[0], mp4);
    }
  };

  const walk = (obj, depth) => {
    if (!obj || typeof obj !== "object" || depth > 24) return;
    if (Array.isArray(obj)) {
      for (const v of obj) walk(v, depth);
      return;
    }
    if (obj.__typename === "User" || typeof obj.screen_name === "string") {
      const userId = obj.rest_id || obj.id_str;
      const username = obj.core?.screen_name || obj.legacy?.screen_name || obj.screen_name;
      if (typeof userId === "string" && typeof username === "string") {
        document.dispatchEvent(new CustomEvent("xmd-api-user", { detail: { userId, username } }));
      }
    }
    if (obj.extended_entities && Array.isArray(obj.extended_entities.media)) {
      scanMedia(obj.extended_entities.media);
    }
    for (const k of Object.keys(obj)) {
      if (k === "extended_entities") continue;
      const v = obj[k];
      if (v && typeof v === "object") walk(v, depth + 1);
    }
  };

  const inspect = resp => {
    try {
      const ct = resp.headers.get("content-type") || "";
      if (!ct.includes("json")) return;
      resp.clone().json().then(j => walk(j, 0)).catch(() => {});
    } catch { /* ignore */ }
  };

  const looksLikeApi = url =>
    /\/graphql\//.test(url) || /\/i\/api\/1\.1\//.test(url) || /\/i\/api\/2\//.test(url);

  // 媒体时间线请求 URL（API 模板）：fetch 实时拦截，比 performance 资源计时更可靠
  const MEDIA_TIMELINE_RE = /\/graphql\/[^/]+\/(UserMedia|UserVideoTimeline|UserTweets|SearchTimeline)/i;
  const emitTemplate = url => {
    try {
      const fullUrl = url.startsWith("http") ? url : window.location.origin + url;
      document.dispatchEvent(new CustomEvent("xmd-api-template", { detail: { url: fullUrl } }));
    } catch { /* ignore */ }
  };

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      try {
        const rawUrl = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        const fullUrl = rawUrl.startsWith("http") ? rawUrl : window.location.origin + rawUrl;
        if (MEDIA_TIMELINE_RE.test(fullUrl)) emitTemplate(fullUrl);
        if (looksLikeApi(fullUrl)) p.then(inspect).catch(() => {});
      } catch { /* ignore */ }
      return p;
    };
  }

  // 兜底：也拦 XMLHttpRequest（X 的媒体时间线请求走 XHR）
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const rawUrl = typeof url === "string" ? url : "";
    const fullUrl = rawUrl.startsWith("http") ? rawUrl : window.location.origin + rawUrl;
    this.__xmd_url = fullUrl;
    if (MEDIA_TIMELINE_RE.test(fullUrl)) emitTemplate(fullUrl);
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      try {
        const u = this.__xmd_url || "";
        if (!looksLikeApi(u)) return;
        const ct = this.getResponseHeader("content-type") || "";
        if (!ct.includes("json")) return;
        walk(this.responseType === "json" ? this.response : JSON.parse(this.responseText), 0);
      } catch { /* ignore */ }
    });
    return origSend.apply(this, args);
  };
})();
