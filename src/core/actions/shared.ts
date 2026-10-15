// 动作共享内部助手：目录分段 / 单件下载 / 重编号 / 标记已存。
// store 只留状态，动作拆到 download.ts / push.ts，本模块提供两者共用的闭包助手。

import type { MediaItem } from "../types";
import type { XmdState } from "../engine";
import { mediaKey } from "../utils";
import { addRecord, getSeqBase, hasRecord, reserveSeq, storeSize } from "../store";
import { addHistory } from "../history";
import { downloadWithRetry } from "../downloader";
import { renumberByTimeline, type NamingContext } from "../naming";

export const CONFIG = {
  delay: 300,
  apiMaxPages: 10,
  apiDelay: 1200,
  autoScroll: { interval: 1200, stepDistance: 800, maxScrolls: 100, pauseOnNewMedia: true },
};

export type SetFn = (partial: Partial<XmdState> | ((s: XmdState) => Partial<XmdState>)) => void;
export type GetFn = () => XmdState;

/** 已保存的媒体始终保留状态展示，并自动排除批量选择。 */
export function markSaved(items: MediaItem[]): void {
  for (const it of items) {
    if (hasRecord(mediaKey(it.url))) {
      it.savedBefore = true;
      it.status = "done";
      it.selected = false;
    } else {
      it.selected = true;
    }
  }
}

export function makeHelpers(set: SetFn, get: GetFn) {
  /** 目录分段：会话子文件夹覆盖 > 设置文件夹策略 */
  const segmentsFor = (nctx: NamingContext): string[] => {
    const sub = get().subfolder.trim();
    if (sub) return [sanitizeSub(sub)];
    return folderSegmentsOf(get().settings, nctx);
  };

  const ctxOf = (it: MediaItem): NamingContext => ({
    username: it.username,
    tweetTime: it.tweetTime,
    tweetId: it.tweetId,
    tweetText: it.tweetText,
  });

  const renumberAll = (items: MediaItem[]) =>
    renumberByTimeline(items.filter(it => !it.downloadSegments), get().settings, getSeqBase, segmentsFor);

  const reserveNames = (items: MediaItem[]) => {
    const fresh = items.filter(it => !it.downloadSegments);
    renumberByTimeline(fresh, get().settings, reserveSeq, segmentsFor);
    for (const item of fresh) item.downloadSegments = segmentsFor(ctxOf(item));
  };

  /** 单个媒体：下载 + 写历史，文件名和计数已在开始前预留。 */
  const downloadOne = async (item: MediaItem) => {
    const segs = item.downloadSegments ?? segmentsFor(ctxOf(item));
    const result = await downloadWithRetry(
      item,
      get().dirHandle,
      segs,
      () => get().shouldStop,
      get().settings.download.retry,
    );
    if (result.success) {
      addRecord(mediaKey(item.url));
      set(s => ({
        storeCount: storeSize(),
        items: s.items.map(it => mediaKey(it.url) === mediaKey(item.url)
          ? { ...it, status: "done", savedBefore: true, selected: false, error: undefined }
          : it),
      }));
      addHistory({
        url: item.url,
        user: item.username,
        tweetId: item.tweetId,
        tweetUrl:
          item.username && item.tweetId
            ? `https://x.com/${item.username}/status/${item.tweetId}`
            : undefined,
        type: item.type,
        fileName: item.fileName,
        folder: segs.join("/"),
        ts: Date.now(),
        bytes: result.bytes,
        thumb: item.thumbnail || undefined,
        avatar: item.avatar,
      });
    }
    return result;
  };

  return { segmentsFor, ctxOf, renumberAll, reserveNames, downloadOne };
}

export type Helpers = ReturnType<typeof makeHelpers>;

// 局部小工具，避免与 utils 循环
import { sanitize } from "../utils";
import { folderSegments } from "../naming";
import type { XmdSettings } from "../settings";
function sanitizeSub(s: string): string {
  return sanitize(s);
}
function folderSegmentsOf(settings: XmdSettings, ctx: NamingContext): string[] {
  return folderSegments(settings, ctx);
}
