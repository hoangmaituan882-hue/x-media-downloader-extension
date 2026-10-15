import type { MediaItem, MediaSource, MediaType } from "./types";
import { decodeSnowflake, getBestUrl, normalizeAvatar, uid } from "./utils";
import { getPageContext } from "./page";

/**
 * 从媒体元素向上遍历提取博文发布时间
 * v7.1：找不到时返回 null，不再用全页 time 元素兜底误标他人日期
 */
export function extractTweetTime(element: Element): Date | null {
  try {
    const tweet = element.closest('article, [data-testid="tweet"]');
    if (tweet) {
      const timeEl = tweet.querySelector("time[datetime]");
      if (timeEl) {
        const d = new Date(timeEl.getAttribute("datetime") || "");
        if (!isNaN(d.getTime())) return d;
      }
      const statusLink = tweet.querySelector('a[href*="/status/"]');
      if (statusLink) {
        const decoded = decodeSnowflake(statusLink.getAttribute("href"));
        if (decoded) return decoded;
      }
    }

    let el: Element | null = element;
    for (let i = 0; i < 25 && el; i++) {
      el = el.parentElement;
      if (!el) break;

      const timeEl = el.querySelector("time[datetime]");
      if (timeEl) {
        const d = new Date(timeEl.getAttribute("datetime") || "");
        if (!isNaN(d.getTime())) return d;
      }

      const statusLink = el.querySelector('a[href*="/status/"]');
      if (statusLink) {
        const decoded = decodeSnowflake(statusLink.getAttribute("href"));
        if (decoded) return decoded;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 提取媒体所属推文的作者与推文 ID。
 * 混流页面（首页/搜索）每条推文作者不同，必须逐条抓取；
 * 资料页扫描时由调用方用页面上下文兜底。
 */
export function extractTweetMeta(element: Element): { username?: string; tweetId?: string; avatar?: string; tweetText?: string } {
  try {
    const el = element.closest('article, [data-testid="tweet"]');
    if (el) {
      let username: string | undefined;
      const userLink = el.querySelector('[data-testid="User-Name"] a[href^="/"]');
      const href = userLink?.getAttribute("href") || "";
      if (/^\/[^/]+$/.test(href)) username = href.slice(1);
      const statusHref = el.querySelector('a[href*="/status/"]')?.getAttribute("href") || "";
      const m = statusHref.match(/\/status\/(\d+)/);
      const ava = el.querySelector('[data-testid^="UserAvatar-Container"] img') as HTMLImageElement | null;
      const avatar = ava?.src ? normalizeAvatar(ava.src) : undefined;
      const textEl = el.querySelector('[data-testid="tweetText"]');
      const tweetText = textEl ? (textEl as HTMLElement).innerText || textEl.textContent || undefined : undefined;
      return { username, tweetId: m ? m[1] : undefined, avatar, tweetText };
    }
  } catch {}
  return {};
}

function getBestVideoUrl(videoEl: HTMLVideoElement, fallbackUrl: string): string {
  const sources = videoEl.querySelectorAll("source");
  if (sources.length > 0) {
    let best = sources[0];
    sources.forEach(s => {
      const sz = s.getAttribute("size") || "0";
      const bestSz = best.getAttribute("size") || "0";
      if (parseInt(sz) > parseInt(bestSz)) best = s;
    });
    return (best as HTMLSourceElement).src || fallbackUrl;
  }
  return fallbackUrl;
}

/**
 * 扫描当前可见DOM中的所有媒体元素
 * @param existing 已有条目（用于去重）
 * @returns 新发现的媒体项（未合并）
 */
export function scanVisibleMedia(existing: MediaItem[]): MediaItem[] {
  const existingUrls = new Set(existing.map(m => m.url.split("?")[0]));
  // 视频是 MSE blob: URL，每次刷新都变、无法按 URL 去重；改用稳定的 poster 封面去重
  const existingPosters = new Set(
    existing.filter(m => m.type === "video" && m.thumbnail).map(m => m.thumbnail.split("?")[0]),
  );
  const foundItems: MediaItem[] = [];

  // 作者/推文 ID：逐条抓取，资料页用页面上下文兜底
  const pageCtx = getPageContext();
  const pageUser =
    pageCtx.type === "profile_media" || pageCtx.type === "profile_home" ? pageCtx.username : undefined;
  const pageTweetId = pageCtx.type === "single_tweet" ? pageCtx.tweetId : undefined;
  const metaFor = (el: Element) => {
    const meta = extractTweetMeta(el);
    return {
      username: meta.username || pageUser,
      tweetId: meta.tweetId || pageTweetId,
      avatar: meta.avatar,
      tweetText: meta.tweetText,
    };
  };

  // 图片
  document.querySelectorAll("img").forEach((img, idx) => {
    const src = img.src || img.dataset.src || img.currentSrc;
    // 只扫 X 照片直链（media/），过滤头像(profile_images)、封面(profile_banners)、
    // 视频封面(amplify_video_thumb/tweet_video_thumb)、emoji 等非照片图片
    if (!src || !src.includes("pbs.twimg.com/media/")) return;
    // 过滤明确的小图标（如小于 40px 的微标），未加载完成(naturalWidth=0)则保留
    if (img.naturalWidth > 0 && img.naturalWidth < 40 && img.clientWidth > 0 && img.clientWidth < 40) return;

    const bestUrl = getBestUrl(src);
    if (!bestUrl) return;
    if (existingUrls.has(bestUrl.split("?")[0])) return;

    const tweetTime = extractTweetTime(img);
    foundItems.push({
      id: uid("img"),
      type: "image",
      url: bestUrl,
      thumbnail: bestUrl.replace(/&name=orig/, "&name=small").replace(/name=orig/, "name=small"),
      fileName: "", // 由 renumberByTimeline 按设置模板统一分配
      status: "pending",
      source: "img_tag" as MediaSource,
      selected: true,
      tweetTime,
      ...metaFor(img),
    });
  });

  // 视频
  document.querySelectorAll("video").forEach((video, idx) => {
    const src = video.src || video.currentSrc || video.querySelector("source")?.src;
    if (!src) return;
    const poster = (video.poster || "").split("?")[0];
    // 有 poster 用 poster 去重（稳定）；无 poster 退回 URL 去重
    if (poster) {
      if (existingPosters.has(poster)) return;
      existingPosters.add(poster);
    } else if (existingUrls.has(src.split("?")[0])) {
      return;
    }

    const bestVideoUrl = getBestVideoUrl(video, src);
    const tweetTime = extractTweetTime(video);
    foundItems.push({
      id: uid("vid"),
      type: "video",
      url: bestVideoUrl,
      thumbnail: video.poster || "",
      fileName: "",
      status: "pending",
      source: "video_tag" as MediaSource,
      selected: true,
      tweetTime,
      ...metaFor(video),
    });
  });

  // data 属性
  document.querySelectorAll("[data-image-url], [data-video-url], [data-media-url]").forEach((el, idx) => {
    const imgUrl = (el as HTMLElement).dataset.imageUrl || (el as HTMLElement).dataset.mediaUrl;
    const vidUrl = (el as HTMLElement).dataset.videoUrl;

    if (imgUrl) {
      const u = getBestUrl(imgUrl);
      if (u && !existingUrls.has(u.split("?")[0])) {
        foundItems.push({
          id: uid("di"),
          type: "image",
          url: u,
          thumbnail: imgUrl,
          fileName: "",
          status: "pending",
          source: "data_attr",
          selected: true,
          tweetTime: null,
          ...metaFor(el),
        });
      }
    }
    if (vidUrl && !existingUrls.has(vidUrl.split("?")[0])) {
      foundItems.push({
        id: uid("dv"),
        type: "video",
        url: vidUrl,
        thumbnail: "",
        fileName: "",
        status: "pending",
        source: "data_attr",
        selected: true,
        tweetTime: null,
        ...metaFor(el),
      });
    }
  });

  return foundItems;
}
