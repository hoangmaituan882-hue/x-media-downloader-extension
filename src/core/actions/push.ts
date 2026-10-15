// 推送类动作：API 分页抓取 / 推送下载（进相册→加载全部→全部下载）。

import type { MediaItem } from "../types";
import { mediaKey, sleep, uid } from "../utils";
import { getPageContext } from "../page";
import {
  ApiRateLimitError,
  fetchUserMediaPage,
  findApiTemplate,
} from "../api";
import { CONFIG, markSaved, type GetFn, type Helpers, type SetFn } from "./shared";
import { VIDEO_CAPS } from "../settings";

export function createPushActions(set: SetFn, get: GetFn, h: Helpers) {
  return {
    async apiFetch(maxPages?: number) {
      const pageCtx = getPageContext();
      if (pageCtx.type === "search") {
        get().toast("搜索页请使用「加载」自动滚动或「扫描」抓取全部媒体", "info");
        return;
      }
      if (pageCtx.type !== "profile_media") {
        get().toast("API 模式仅支持用户媒体页（x.com/用户名/media）", "warning");
        return;
      }
      const pageLimit = maxPages ?? CONFIG.apiMaxPages;
      const tpl = findApiTemplate(pageCtx.username);
      if (!tpl) {
        get().toast("尚未捕获当前博主的媒体请求。请先点击页面上的「媒体」标签，等列表加载后再点此按钮", "warning");
        return;
      }

      set({ isApiFetching: true, shouldStop: false, apiPage: 0, items: [], dlTotal: 0, dlDone: 0 });

      const seen = new Set<string>();
      let cursor: string | null = null;
      try {
        while (get().apiPage < pageLimit && !get().shouldStop) {
          // 不吞错误：429/非 2xx 抛给外层 catch 显示对应提示
          const parsed = await fetchUserMediaPage(
            tpl, tpl.userId, cursor, VIDEO_CAPS[get().settings.download.videoQuality],
          );
          if (!parsed) break;

          const fresh: MediaItem[] = [];
          for (const m of parsed.items) {
            const key = mediaKey(m.url);
            if (seen.has(key)) continue;
            seen.add(key);
            fresh.push({
              id: uid(m.kind === "video" ? "av" : "ai"),
              type: m.kind,
              url: m.url,
              thumbnail: m.thumb,
              fileName: "",
              status: "pending",
              source: "api",
              selected: true,
              tweetTime: m.tweetTime,
              username: pageCtx.username,
              tweetId: m.tweetId,
              avatar: m.avatar,
              tweetText: m.tweetText,
            });
          }
          if (fresh.length) {
            markSaved(fresh);
            const items = [...get().items, ...fresh];
            h.renumberAll(items);
            set({ items });
          }
          set(s => ({ apiPage: s.apiPage + 1 }));

          cursor = parsed.cursorBottom;
          if (!cursor) break;
          await sleep(CONFIG.apiDelay);
        }
      } catch (e) {
        if (e instanceof ApiRateLimitError) {
          get().toast("API 限频（429），已停止。请稍后再试或改用自动加载", "error");
        } else {
          console.error("[XMD] API 抓取失败:", e);
          get().toast(`API 抓取失败：${(e as Error).message}`, "error");
        }
      }

      set({ isApiFetching: false });
      if (!get().shouldStop) {
        get().toast(`API 抓取完成：${get().items.length} 个媒体（${get().apiPage} 页）`, "success");
      }
    },

    /**
     * 推送下载：自动进相册 → 加载全部 → 全部下载。
     * 不在媒体页时先跳转（意图存 sessionStorage，跨跳转存活），
     * 已在媒体页时直接跑 runPushPipeline。
     */
    async pushDownload() {
      const pageCtx = getPageContext();
      if (pageCtx.type === "profile_media") {
        await get().runPushPipeline();
        return 1;
      }
      const user = pageCtx.type === "profile_home" ? pageCtx.username : null;
      if (!user) {
        get().toast("悬浮卡仅在博主主页可用", "warning");
        return 0;
      }
      sessionStorage.setItem(PUSH_KEY_LOCAL, user);
      get().toast("正在进入相册…", "info");
      location.href = `/${user}/media`;
      return 1;
    },

    /** 媒体页上的完整链路：加载全部（API 优先/滚动兜底）→ 下载全部 */
    async runPushPipeline() {
      set({ pushActive: true, shouldStop: false });
      try {
        get().toast("推送下载：加载全部媒体…", "info");
        // 等 X 客户端发出 UserMedia 请求（拿到模板才能 API 全量翻页）
        let tpl: ReturnType<typeof findApiTemplate> = null;
        const username = getPageContext().username;
        for (let i = 0; i < 10 && !tpl; i++) {
          tpl = findApiTemplate(username);
          if (!tpl) await sleep(600);
        }
        if (tpl) {
          await get().apiFetch(60); // 全量翻页（上限 60 页防失控）
        } else {
          await get().startAutoScroll(); // 无模板时滚动加载兜底
        }
        if (get().shouldStop) return get().completedCount;
        await get().downloadAll(); // 下载全部选中项（跳过关由设置控制）
      } finally {
        set({ pushActive: false });
      }
      return get().completedCount;
    },
  };
}

// 与 engine 的 PUSH_KEY 同值；此处局部定义避免循环导入
const PUSH_KEY_LOCAL = "xmd_push";
