// 引擎层：zustand 状态容器。动作已拆分至 actions/（download / push / shared），
// 本文件只保留状态字段、UI 级动作（扫描/滚动/视图/设置/选择）与组合装配。

import { create } from "zustand";
import type { FilterKind, MediaItem, ToastKind, ToastMsg } from "./types";
import { mediaKey, sleep, uid } from "./utils";
import { pickDirectory } from "./downloader";
import { storeSize } from "./store";
import { getPageContext, getScrollableElement, performScroll } from "./page";
import { scanVisibleMedia } from "./scanner";
import {
  DEFAULT_SETTINGS, mergeSettings, saveSettings, type SettingsPatch, type XmdSettings,
} from "./settings";
import { CONFIG, makeHelpers, markSaved } from "./actions/shared";
import { createDownloadActions } from "./actions/download";
import { createPushActions } from "./actions/push";

/** 推送下载跨跳转意图键 */
export const PUSH_KEY = "xmd_push";
export type { SingleInput } from "./single-types";

export interface XmdState {
  items: MediaItem[];
  filter: FilterKind;
  isScanning: boolean;
  isAutoScrolling: boolean;
  isApiFetching: boolean;
  isDownloading: boolean;
  isStopping: boolean;
  shouldStop: boolean;
  scrollCount: number;
  apiPage: number;
  completedCount: number;
  errorCount: number;
  dlTotal: number;
  dlDone: number;
  dirHandle: FileSystemDirectoryHandle | null;
  folderName: string;
  /** 本次会话子文件夹覆盖（优先于设置里的文件夹策略） */
  subfolder: string;
  storeCount: number;
  fsApiSupported: boolean;
  collapsed: boolean;
  toasts: ToastMsg[];
  settings: XmdSettings;
  /** 面板视图：主面板 / 设置 / 历史 / 关于 */
  view: "main" | "settings" | "history" | "about";
  mediaView: import("./types").MediaViewKind;
  /** 当前聚焦查看的单个博主（Pack 视图下钻） */
  focusedAuthor: string | null;
  /** 推送下载管线进行中（悬浮卡胶囊显示转圈+实时计数） */
  pushActive: boolean;

  toast: (text: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
  setSettings: (patch: SettingsPatch) => void;
  setView: (v: "main" | "settings" | "history" | "about") => void;
  setMediaView: (v: import("./types").MediaViewKind) => void;
  setFocusedAuthor: (author: string | null) => void;
  selectAuthorItems: (username: string, selectAll?: boolean) => void;
  selectTweetItems: (tweetKey: string, selectAll?: boolean) => void;
  scan: () => Promise<void>;
  startAutoScroll: () => Promise<void>;
  stopAutoScroll: () => void;
  stopAny: () => void;
  selectFolder: () => Promise<void>;
  clearFolder: () => void;
  setSubfolder: (v: string) => void;
  enqueueExternal: (input: import("./single-types").SingleInput) => void;
  // 以下由 actions/ 工厂装配：
  apiFetch: (maxPages?: number) => Promise<void>;
  pushDownload: () => Promise<number>;
  runPushPipeline: () => Promise<number>;
  downloadAll: () => Promise<void>;
  downloadSingle: (input: import("./single-types").SingleInput) => Promise<void>;
  redownloadUser: (user: string) => Promise<void>;
  clearHistoryUser: (user: string) => void;
  clearHistoryAll: () => void;
  clearStore: () => void;
  toggleItem: (id: string) => void;
  selectAll: () => void;
  invertSelection: () => void;
  clearSelection: () => void;
  setFilter: (f: FilterKind) => void;
  toggleCollapsed: () => void;
  startDemo: () => void;
  retryFailed: () => void;
}

const ctx = getPageContext();
const isProfile = ctx.type === "profile_media" || ctx.type === "profile_home";

export const useXmd = create<XmdState>()((set, get) => {
  const h = makeHelpers(set, get);

  return {
    items: [],
    filter: "all",
    isScanning: false,
    isAutoScrolling: false,
    isApiFetching: false,
    isDownloading: false,
    isStopping: false,
    shouldStop: false,
    scrollCount: 0,
    apiPage: 0,
    completedCount: 0,
    errorCount: 0,
    dlTotal: 0,
    dlDone: 0,
    dirHandle: null,
    folderName: "",
    subfolder: isProfile ? ctx.username || "" : "",
    storeCount: 0,
    fsApiSupported:
      typeof window !== "undefined" &&
      !!(window as any).showDirectoryPicker &&
      !!(window as any).showOpenFilePicker,
    collapsed: (() => {
      try {
        return localStorage.getItem("xmd_collapsed") === "1";
      } catch {
        return false;
      }
    })(),
    mediaView: (() => {
      try {
        const saved = localStorage.getItem("xmd_media_view");
        if (saved === "list" || saved === "card" || saved === "pack") return saved;
      } catch { /* ignore */ }
      return "card";
    })(),
    focusedAuthor: null,
    toasts: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    view: "main",
    pushActive: false,

    toast(text, kind = "info") {
      const id = `${Date.now().toString(36)}_${get().toasts.length}`;
      set(s => ({ toasts: [...s.toasts.slice(-3), { id, text, kind, created: Date.now() }] }));
      setTimeout(() => get().dismissToast(id), 4000);
    },

    dismissToast(id) {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    },

    setSettings(patch) {
      const next = mergeSettings(get().settings, patch);
      saveSettings(next);
      set({ settings: next });
    },

    setView(v) {
      set({ view: v });
    },

    async scan() {
      set({ isScanning: true, shouldStop: false, dlTotal: 0, dlDone: 0 });
      try {
        const existing = get().items;
        const newFound = scanVisibleMedia(existing);
        if (newFound.length > 0) {
          markSaved(newFound);
          const combined = [...existing, ...newFound];
          h.renumberAll(combined);
          set({ items: combined });
          get().toast(`已发现 ${newFound.length} 个新媒体（当前共 ${combined.length} 项）`, "success");
        } else if (existing.length === 0) {
          const fullScan = scanVisibleMedia([]);
          if (fullScan.length > 0) {
            markSaved(fullScan);
            h.renumberAll(fullScan);
            set({ items: fullScan });
            get().toast(`扫描完成！发现 ${fullScan.length} 个媒体`, "success");
          } else {
            get().toast("当前视口未检测到新媒体，可点击「加载」向下滚动或「API」抓取", "warning");
          }
        } else {
          get().toast(`当前视口无新媒体（已保留现有 ${existing.length} 项），可向下滚动`, "info");
        }
      } catch (e) {
        console.error("[XMD] 扫描错误:", e);
        get().toast("扫描出错，请刷新页面重试", "error");
      } finally {
        set({ isScanning: false });
      }
    },

    async startAutoScroll() {
      if (get().isAutoScrolling) return;
      set({
        isAutoScrolling: true, shouldStop: false, scrollCount: 0,
        dlTotal: 0, dlDone: 0,
      });

      const cfg = CONFIG.autoScroll;
      const mainEl = getScrollableElement();
      let noNewContentCount = 0;
      let lastScrollHeight = document.documentElement.scrollHeight;

      while (get().isAutoScrolling && !get().shouldStop) {
        if (cfg.maxScrolls > 0 && get().scrollCount >= cfg.maxScrolls) {
          get().toast(`已达最大滚动次数 (${cfg.maxScrolls})`, "info");
          break;
        }

        performScroll(mainEl, cfg.stepDistance);
        set(s => ({ scrollCount: s.scrollCount + 1 }));
        await sleep(cfg.interval);

        const newItems = scanVisibleMedia(get().items);
        const currentHeight = document.documentElement.scrollHeight;

        if (newItems.length > 0) {
          noNewContentCount = 0;
          markSaved(newItems);
          const items = [...get().items, ...newItems];
          h.renumberAll(items);
          set({ items });
          if (cfg.pauseOnNewMedia) await sleep(300);
        } else {
          noNewContentCount++;
          if (noNewContentCount >= 5) {
            const atBottom =
              window.innerHeight + (window.scrollY || mainEl.scrollTop) >=
              document.documentElement.scrollHeight - 200;
            if (atBottom || currentHeight === lastScrollHeight) {
              get().toast("已到达页面底部！", "success");
              await sleep(1500);
              const late = scanVisibleMedia(get().items);
              if (late.length === 0) break;
              markSaved(late);
              const items = [...get().items, ...late];
              h.renumberAll(items);
              set({ items });
              noNewContentCount = 0;
            }
          }
        }
        lastScrollHeight = currentHeight;
      }

      set({ isAutoScrolling: false });
      if (!get().shouldStop) {
        get().toast(`自动加载完成！共发现 ${get().items.length} 个媒体`, "success");
      }
    },

    async stopAutoScroll() {
      const s = get();
      if (s.isStopping) return;
      set({ shouldStop: true, isStopping: true });
      get().toast("正在停止…", "info");
      await sleep(750);
      set({ shouldStop: true, isStopping: false, isAutoScrolling: false });
      get().toast("已停止", "info");
    },

    async stopAny() {
      const s = get();
      if (s.isStopping) return;
      set({ shouldStop: true, isStopping: true });
      get().toast("正在停止…", "info");
      await sleep(750);
      set({
        isStopping: false,
        isAutoScrolling: false,
        isApiFetching: false,
        isDownloading: false,
        pushActive: false,
      });
      get().toast("已停止", "info");
    },

    async selectFolder() {
      if (!get().fsApiSupported) {
        get().toast("当前浏览器不支持文件夹选择，将使用默认下载目录", "warning");
        return;
      }
      try {
        const handle = await pickDirectory();
        if (!handle) return;
        set({ dirHandle: handle, folderName: handle.name || "已选择" });
        get().toast(`已选: ${handle.name}`, "success");
      } catch (e: any) {
        console.error("[XMD]", e);
        get().toast(`选择失败: ${e?.message}`, "error");
      }
    },

    clearFolder() {
      set({ dirHandle: null, folderName: "" });
    },

    setSubfolder(v) {
      set({ subfolder: v });
    },

    /** hover 按钮「加入队列」模式（URL 去重） */
    enqueueExternal(input) {
      const key = mediaKey(input.url);
      const dup = get().items.find(it => mediaKey(it.url) === key);
      if (dup) {
        get().toast(dup.status === "done" ? "已下载过" : "已在队列中", "info");
        return;
      }
      const item: MediaItem = {
        id: uid("queue"), type: input.type, url: input.url, thumbnail: input.thumbnail || "",
        fileName: "", status: "pending", source: "inline", selected: true,
        tweetTime: input.tweetTime, username: input.username, tweetId: input.tweetId,
        avatar: input.avatar,
      };
      markSaved([item]);
      const items = [...get().items, item];
      h.renumberAll(items);
      set({ items });
      get().toast("已加入下载队列", "info");
    },

    ...createPushActions(set, get, h),
    ...createDownloadActions(set, get, h),

    toggleItem(id) {
      set(s => ({
        items: s.items.map(it => {
          if (it.id !== id || it.status === "loading" || it.status === "done" || it.savedBefore) return it;
          const selected = !it.selected;
          return { ...it, selected };
        }),
      }));
    },

    selectAll() {
      set(s => ({
        items: s.items.map(it => (it.savedBefore || it.status === "done" || it.status === "loading" ? it : { ...it, selected: true })),
      }));
    },

    invertSelection() {
      set(s => ({
        items: s.items.map(it => {
          if (it.savedBefore || it.status === "done" || it.status === "loading") return it;
          const selected = !it.selected;
          return { ...it, selected };
        }),
      }));
    },

    clearSelection() {
      set(s => ({ items: s.items.map(it => ({ ...it, selected: false })) }));
    },

    setFilter(f) {
      set({ filter: f });
    },

    setMediaView(v) {
      try {
        localStorage.setItem("xmd_media_view", v);
      } catch { /* ignore */ }
      set({ mediaView: v });
    },

    setFocusedAuthor(author) {
      set({ focusedAuthor: author });
    },

    selectAuthorItems(username, selectAll = true) {
      set(s => ({
        items: s.items.map(it => {
          if (it.savedBefore || it.status === "done" || it.status === "loading") return it;
          const itUser = it.username || "未知博主";
          if (itUser === username || (username === "其他博主" && !it.username)) {
            return { ...it, selected: selectAll };
          }
          return it;
        }),
      }));
    },

    selectTweetItems(tweetKey, selectAll = true) {
      set(s => ({
        items: s.items.map(it => {
          if (it.savedBefore || it.status === "done" || it.status === "loading") return it;
          const key = it.tweetId || `solo_${it.id}`;
          if (key === tweetKey || it.id === tweetKey) {
            return { ...it, selected: selectAll };
          }
          return it;
        }),
      }));
    },

    toggleCollapsed() {
      const next = !get().collapsed;
      try {
        localStorage.setItem("xmd_collapsed", next ? "1" : "0");
      } catch { /* ignore */ }
      set({ collapsed: next });
    },

    /** #xmd-demo 深链：伪造队列并推进状态，用于展示专注模式动效 */
    startDemo() {
      const items: MediaItem[] = Array.from({ length: 96 }, (_, i) => ({
        id: `demo${i}`,
        type: i % 6 === 0 ? ("video" as const) : ("image" as const),
        url: `https://pbs.twimg.com/media/demo${i}?format=jpg`,
        thumbnail: "",
        fileName: `2026-08-21_${String(i + 1).padStart(3, "0")}.jpg`,
        status: "pending" as const,
        source: "api" as const,
        selected: true,
        tweetTime: new Date(),
        username: "demo",
      }));
      set({
        view: "main", collapsed: false, items: [],
        isAutoScrolling: true, isDownloading: false,
        dlTotal: 0, dlDone: 0, completedCount: 0, errorCount: 0,
      });
      // 阶段1：采集（计数镗刻）→ 阶段2：下载（一格一媒体）
      let added = 0;
      const grow = setInterval(() => {
        // 演示也响应停止：停止后不再进入下载阶段
        if (get().shouldStop || !get().isAutoScrolling) {
          clearInterval(grow);
          set({ isAutoScrolling: false });
          return;
        }
        if (added >= items.length) {
          clearInterval(grow);
          set({ isAutoScrolling: false, isDownloading: true, dlTotal: items.length });
          runDownload();
          return;
        }
        const batch = items.slice(added, added + 5);
        added += batch.length;
        set(s => ({ items: [...s.items, ...batch] }));
      }, 160);

      const runDownload = () => {
        let i = 0;
        const t = setInterval(() => {
          if (!get().isDownloading) {
            clearInterval(t);
            return;
          }
          const doneIds = new Set<string>();
          for (let k = 0; k < 2 && i < items.length; k++, i++) doneIds.add(items[i].id);
          set(s => ({
            items: s.items.map(it => (doneIds.has(it.id) ? { ...it, status: "done" } : it)),
            dlDone: i,
            completedCount: i,
          }));
          if (i >= items.length) {
            clearInterval(t);
            set({ isDownloading: false });
            get().toast("演示完成 ✅96", "success");
          }
        }, 140);
      };
    },
  };
});

/** 网格渲染上限 */
export const GRID_MAX_RENDER = 200;
