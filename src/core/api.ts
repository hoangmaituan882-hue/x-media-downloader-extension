// GraphQL API 模式：复用 X 客户端已发出的 UserMedia 请求模板分页抓取。
// 不硬编码 queryId（它随 X 前端发版漂移），直接从 performance 资源条目
// 里取客户端刚用过的 URL（含 queryId/features/userId），天然免疫漂移。

import type { MediaType } from "./types";
import { getBestUrl, normalizeAvatar, twimgThumb } from "./utils";
import { getPageContext } from "./page";

// X Web 客户端的公共 Bearer Token（本就内嵌在 X 前端 JS 中，非秘密）
const X_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

export function getCsrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
  return m ? m[1] : "";
}

export interface ApiTemplate {
  base: string;
  userId: string;
  features: string | null;
  fieldToggles: string | null;
}

// X 的媒体时间线端点随发版改名（UserMedia → UserVideoTimeline 等）。
// 模板 URL 两个来源：
// 1) injected.js 的 fetch 拦截（实时、可靠，不受 performance 资源计时清空影响）
// 2) PerformanceObserver + performance 资源条目（兜底）
const MEDIA_TIMELINE_RE = /\/graphql\/[^/]+\/(UserMedia|UserVideoTimeline|UserTweets|SearchTimeline)/i;
const _tplCache: string[] = [];
// 归属只来自响应内的 User 对象；请求发出/返回时的 SPA 路由可能已经改变。
const _userNames = new Map<string, string>();
let _listenerInstalled = false;

function pushTemplate(url: string): void {
  _tplCache.push(url);
  if (_tplCache.length > 50) _tplCache.shift();
}

/** 接收 injected.js 拦到的媒体时间线请求 URL（主 world fetch 实时派发） */
function installTemplateListener(): void {
  if (_listenerInstalled) return;
  _listenerInstalled = true;
  document.addEventListener("xmd-api-template", e => {
    const d = (e as CustomEvent).detail as { url?: string } | undefined;
    if (d?.url && MEDIA_TIMELINE_RE.test(d.url)) pushTemplate(d.url);
  });
  document.addEventListener("xmd-api-user", e => {
    const d = (e as CustomEvent).detail as { userId?: string; username?: string } | undefined;
    if (typeof d?.userId !== "string" || !/^\d+$/.test(d.userId) ||
        typeof d.username !== "string" || !/^[a-z0-9_]{1,15}$/i.test(d.username)) return;
    const username = d.username.toLowerCase();
    for (const [id, name] of _userNames) {
      if (name === username || id === d.userId) _userNames.delete(id);
    }
    _userNames.set(d.userId, username);
    if (_userNames.size > 500) _userNames.delete(_userNames.keys().next().value!);
  });
}
installTemplateListener();

/** performance 兜底：resource 计时可用时缓存请求 URL */
function installTemplateObserver(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const obs = new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        const n = e.name || "";
        if (MEDIA_TIMELINE_RE.test(n)) pushTemplate(n);
      }
    });
    obs.observe({ type: "resource", buffered: true });
  } catch { /* ignore */ }
}
installTemplateObserver();

export function findApiTemplate(expectedUsername = getPageContext().username): ApiTemplate | null {
  if (!expectedUsername) return null;
  const username = expectedUsername.toLowerCase();
  try {
    const names = [
      ..._tplCache,
      ...performance
        .getEntriesByType("resource")
        .map(e => e.name)
        .filter(n => MEDIA_TIMELINE_RE.test(n)),
    ];
    if (!names.length) return null;

    // 从后向前寻找已验证属于目标博主的模板；无法确认归属时等待新请求。
    for (let i = names.length - 1; i >= 0; i--) {
      try {
        const rawUrl = names[i];
        if (!rawUrl) continue;
        const u = new URL(rawUrl, window.location.origin);
        let userId: string | null = null;
        try {
          const vars = JSON.parse(u.searchParams.get("variables") || "{}");
          userId = vars.userId || vars.user_id || null;
        } catch {}
        if (userId && _userNames.get(userId) === username) {
          return {
            base: u.origin + u.pathname,
            userId,
            features: u.searchParams.get("features"),
            fieldToggles: u.searchParams.get("fieldToggles"),
          };
        }
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

export interface ApiMediaEntry {
  kind: MediaType;
  url: string;
  thumb: string;
  tweetTime: Date | null;
  tweetId?: string;
  avatar?: string;
  tweetText?: string;
}

export interface ParsedPage {
  items: ApiMediaEntry[];
  cursorBottom: string | null;
}

/** 解析 UserMedia / 搜索时间线响应：提取媒体条目与下一页游标 */
export function parseUserMediaResponse(json: any, maxBitrate = Infinity): ParsedPage {
  const out: ParsedPage = { items: [], cursorBottom: null };
  try {
    const result = json?.data?.user?.result;
    const instructions =
      result?.timeline_v2?.timeline?.instructions ||
      result?.timeline?.timeline?.instructions ||
      json?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
      [];
    const entries: any[] = [];
    for (const ins of instructions) {
      if (ins.entries?.length) entries.push(...ins.entries);
      if (ins.entry) entries.push(ins.entry);
    }

    for (const entry of entries) {
      const entryId: string = entry.entryId || "";
      if (entryId.startsWith("cursor-bottom") || entry.cursorType === "Bottom") {
        out.cursorBottom = entry.content?.value || entry.content?.itemContent?.value || entry.value || null;
        continue;
      }
      if (!entryId.startsWith("tweet-")) continue;
      const resObj = entry.content?.itemContent?.tweet_results?.result;
      if (!resObj || resObj.__typename === "TweetTombstone") continue;
      const tweetObj = resObj.tweet || resObj;
      const legacy = tweetObj.legacy;
      const mediaList = legacy?.extended_entities?.media;
      if (!mediaList?.length) continue;
      const tweetTime = legacy.created_at ? new Date(legacy.created_at) : null;
      const tweetId = legacy.id_str || entryId.replace(/^tweet-/, "");
      const avatar = normalizeAvatar(
        tweetObj.core?.user_results?.result?.legacy?.profile_image_url_https || "",
      ) || undefined;
      const tweetText =
        tweetObj.note_tweet?.note_tweet_results?.result?.text ||
        legacy?.full_text ||
        legacy?.text ||
        undefined;

      for (const m of mediaList) {
        if (m.type === "photo" && m.media_url_https) {
          out.items.push({
            kind: "image",
            url: getBestUrl(m.media_url_https)!,
            thumb: twimgThumb(m.media_url_https),
            tweetTime,
            tweetId,
            avatar,
            tweetText,
          });
        } else if ((m.type === "video" || m.type === "animated_gif") && m.video_info?.variants?.length) {
          // 视频/GIF：码率上限内选最高 mp4 变体；全超限时退到最低档
          const mps = m.video_info.variants.filter((v: any) => v.content_type === "video/mp4");
          const within = mps.filter((v: any) => (v.bitrate || 0) <= maxBitrate);
          const best = within.length
            ? within.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0]
            : mps.sort((a: any, b: any) => (a.bitrate || 0) - (b.bitrate || 0))[0];
          if (best?.url) {
            out.items.push({
              kind: "video",
              url: best.url,
              thumb: m.media_url_https ? twimgThumb(m.media_url_https) : "",
              tweetTime,
              tweetId,
              avatar,
              tweetText,
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn("[XMD] API 响应解析失败:", e);
  }
  return out;
}

/** 抓取单页 UserMedia；429/非2xx 抛错由调用方处理 */
export async function fetchUserMediaPage(
  tpl: ApiTemplate,
  userId: string,
  cursor: string | null,
  maxBitrate = Infinity,
): Promise<ParsedPage> {
  const variables: Record<string, unknown> = { userId, count: 40, includePromotedContent: false };
  if (cursor) variables.cursor = cursor;
  const params = new URLSearchParams();
  params.set("variables", JSON.stringify(variables));
  if (tpl.features) params.set("features", tpl.features);
  if (tpl.fieldToggles) params.set("fieldToggles", tpl.fieldToggles);

  const res = await fetch(`${tpl.base}?${params.toString()}`, {
    credentials: "include",
    headers: {
      authorization: `Bearer ${X_BEARER}`,
      "x-csrf-token": getCsrfToken(),
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
    },
  });
  if (res.status === 429) throw new ApiRateLimitError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseUserMediaResponse(await res.json(), maxBitrate);
}

export class ApiRateLimitError extends Error {
  constructor() {
    super("API 限频（429）");
    this.name = "ApiRateLimitError";
  }
}
