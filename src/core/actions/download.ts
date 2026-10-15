// 下载类动作：批量下载 / 单张直下 / 按博主补下载 / 历史与记录清理。

import type { MediaItem } from "../types";
import type { SingleInput } from "../single-types";
import { mediaKey, sleep, uid } from "../utils";
import { clearRecords, hasRecord, removeRecords, storeSize } from "../store";
import {
  byUser,
  clearHistoryAll as clearHistoryAllStore,
  clearHistoryUser as clearHistoryUserStore,
  getHistory,
} from "../history";
import { downloadItem } from "../downloader";
import { CONFIG, type GetFn, type Helpers, type SetFn } from "./shared";

export function createDownloadActions(set: SetFn, get: GetFn, h: Helpers) {
  const releaseCleared = (keys?: Set<string>) => {
    set(s => ({
      storeCount: storeSize(),
      items: s.items.map(it => (!keys || keys.has(mediaKey(it.url))) && (it.savedBefore || it.status === "done")
        ? { ...it, status: "pending", savedBefore: false, selected: false, downloadSegments: undefined }
        : it),
    }));
  };
  return {
    async downloadAll() {
      const all = get().items.map(it => it.savedBefore || hasRecord(mediaKey(it.url))
        ? { ...it, status: "done" as const, savedBefore: true, selected: false }
        : it);
      set({ items: all });
      if (!all.length) {
        get().toast("请先扫描、自动加载或 API 抓取收集媒体！", "warning");
        return;
      }
      let queue = all.filter(it => it.selected && (it.status === "pending" || it.status === "error"));
      // 日期区间过滤：只下载最近 N 天发布的（tweetTime 缺失的不过滤）
      const maxAge = get().settings.download.maxAgeDays;
      if (maxAge > 0) {
        const cutoff = Date.now() - maxAge * 86400000;
        const before = queue.length;
        queue = queue.filter(it => !it.tweetTime || it.tweetTime.getTime() >= cutoff);
        const skipped = before - queue.length;
        if (skipped > 0) get().toast(`已跳过 ${skipped} 个超过 ${maxAge} 天的媒体`, "info");
      }
      if (!queue.length) {
        get().toast("没有已选中的待下载项（已下载的不会重复下载）", "info");
        return;
      }

      queue = queue.map(item => ({ ...item }));
      h.reserveNames(queue);
      const prepared = new Map(queue.map(item => [item.id, item]));
      set(s => ({
        items: s.items.map(item => prepared.get(item.id) ?? item),
        isDownloading: true, shouldStop: false, completedCount: 0, errorCount: 0,
        dlTotal: queue.length, dlDone: 0,
      }));

      const patchItem = (id: string, patch: Partial<MediaItem>) => {
        set(s => ({ items: s.items.map(it => (it.id === id ? { ...it, ...patch } : it)) }));
      };

      let cursor = 0;
      const worker = async () => {
        while (!get().shouldStop) {
          const i = cursor++;
          if (i >= queue.length) break;
          const item = queue[i];
          patchItem(item.id, { status: "loading" });

          await sleep(CONFIG.delay);
          const result = await h.downloadOne(item);

          if (result.success) {
            patchItem(item.id, { status: "done" });
            set(s => ({ completedCount: s.completedCount + 1, storeCount: storeSize(), dlDone: s.dlDone + 1 }));
          } else {
            patchItem(item.id, { status: "error", error: result.error });
            set(s => ({ errorCount: s.errorCount + 1, dlDone: s.dlDone + 1 }));
          }
        }
      };
      const poolSize = Math.min(get().settings.download.concurrency, queue.length);
      await Promise.all(Array.from({ length: poolSize }, () => worker()));

      set({ isDownloading: false });

      const { dirHandle, folderName, subfolder, completedCount, errorCount } = get();
      let locationInfo = " → 浏览器默认目录";
      if (dirHandle) {
        const sub = subfolder.trim();
        locationInfo = ` → ${folderName || dirHandle.name}${sub ? "/" + sub : ""}`;
      }
      get().toast(
        `完成! ✅${completedCount} ❌${errorCount}${locationInfo}`,
        errorCount > 0 ? "warning" : "success",
      );

      // 标签在后台时发桌面通知，点击通知跳回页面
      if (typeof chrome !== "undefined" && chrome.runtime?.id && document.hidden) {
        chrome.runtime
          .sendMessage({
            type: "xmd-notify",
            title: "X Media Downloader",
            message: `下载完成 ✅${completedCount} ❌${errorCount}${locationInfo}`,
            url: location.href,
          })
          .catch(() => {});
      }
    },

    /** 重试全部失败项 */
    retryFailed() {
      const n = get().items.filter(it => it.status === "error").length;
      if (!n) return;
      set(s => ({
        items: s.items.map(it =>
          it.status === "error" ? { ...it, status: "pending", error: undefined } : it,
        ),
      }));
      get().toast(`重试 ${n} 个失败项`, "info");
      void get().downloadAll();
    },

    /** 单张直下（hover 按钮 / 右键菜单）：按天计数取 seq，即点即下 */
    async downloadSingle(input: SingleInput) {
      const key = mediaKey(input.url);
      const existing = get().items.find(it => mediaKey(it.url) === key);
      if (hasRecord(key)) {
        set(s => ({ items: s.items.map(it => mediaKey(it.url) === key
          ? { ...it, status: "done", savedBefore: true, selected: false } : it) }));
        get().toast("已下载过", "info");
        return;
      }
      if (existing?.status === "loading") return;
      const item: MediaItem = {
        ...existing,
        id: existing?.id ?? uid("single"),
        type: input.type,
        url: input.url,
        thumbnail: input.thumbnail || existing?.thumbnail || "",
        fileName: existing?.fileName || "",
        status: "loading",
        source: "inline",
        selected: true,
        tweetTime: input.tweetTime ?? existing?.tweetTime ?? null,
        username: input.username ?? existing?.username,
        tweetId: input.tweetId ?? existing?.tweetId,
        avatar: input.avatar ?? existing?.avatar,
        tweetText: input.tweetText ?? existing?.tweetText,
      };
      h.reserveNames([item]);
      set(s => ({ items: existing ? s.items.map(it => it.id === item.id ? item : it) : [...s.items, item] }));

      const result = await h.downloadOne(item);
      if (result.success) {
        set(s => ({
          storeCount: storeSize(),
          items: s.items.map(it => (it.id === item.id ? { ...it, status: "done" } : it)),
        }));
        get().toast(`已下载 ${item.fileName}`, "success");
      } else {
        set(s => ({
          items: s.items.map(it =>
            it.id === item.id ? { ...it, status: "error", error: result.error } : it,
          ),
        }));
        get().toast(`下载失败：${result.error || "未知错误"}`, "error");
      }
    },

    /** 补下载某博主全部历史记录（找回丢失文件），复用原文件名与目录 */
    async redownloadUser(user: string) {
      const recs = byUser(user);
      if (!recs.length) return;
      get().toast(`开始补下载 ${user} 的 ${recs.length} 个媒体`, "info");
      let ok = 0;
      let fail = 0;
      let cursor = 0;
      const worker = async () => {
        for (;;) {
          const i = cursor++;
          if (i >= recs.length) break;
          const r = recs[i];
          const item: MediaItem = {
            id: uid("re"), type: r.type, url: r.url, thumbnail: r.thumb || "", fileName: r.fileName,
            status: "loading", source: "inline", selected: true, tweetTime: null,
            username: r.user, tweetId: r.tweetId,
          };
          const res = await downloadItem(item, get().dirHandle, r.folder ? r.folder.split("/") : []);
          if (res.success) ok++;
          else fail++;
        }
      };
      const pool = Math.min(get().settings.download.concurrency, recs.length);
      await Promise.all(Array.from({ length: pool }, () => worker()));
      get().toast(`补下载完成 ✅${ok} ❌${fail}`, fail > 0 ? "warning" : "success");
    },

    /** 清除某博主历史，并同步去重库（这些媒体变回可下载） */
    clearHistoryUser(user: string) {
      const removed = clearHistoryUserStore(user);
      const keys = new Set(removed.map(r => mediaKey(r.url)));
      removeRecords([...keys]);
      releaseCleared(keys);
      get().toast(`已清除 ${user} 的 ${removed.length} 条记录`, "success");
    },

    clearHistoryAll() {
      const all = getHistory(); // 清空前先取全部记录，用于同步去重库
      const n = clearHistoryAllStore();
      const keys = new Set(all.map(r => mediaKey(r.url)));
      removeRecords([...keys]);
      releaseCleared(keys);
      get().toast(`已清空 ${n} 条历史`, "success");
    },

    clearStore() {
      const n = clearRecords();
      releaseCleared();
      get().toast(n > 0 ? `已清空 ${n} 条下载记录` : "记录为空", "success");
    },
  };
}
