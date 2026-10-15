// 历史库：富下载记录（上限 2000 条环形覆盖），供历史视图/画廊页统计与补下载。
// 与增量去重库（store.ts）分工：那里负责 O(1) 跳过判断，这里负责展示与找回。
// 存储走 kv 适配器：扩展环境 chrome.storage.local（扩展页共享），测试环境 localStorage。

import { inExt, rawGet, rawGetSync, rawSet } from "./kv";

export interface HistoryRecord {
  id: string;
  /** 媒体完整 URL */
  url: string;
  user?: string;
  tweetId?: string;
  /** 原推文链接（user+tweetId 齐全时存入，老记录可能缺失） */
  tweetUrl?: string;
  type: "image" | "video";
  fileName: string;
  /** 目录路径（多段以 / 连接），"" = 根目录 */
  folder: string;
  ts: number;
  bytes?: number;
  /** 缩略图/视频海报，画廊网格用 */
  thumb?: string;
  /** 博主头像 URL（历史榜/画廊展示用） */
  avatar?: string;
}

export interface UserAgg {
  user: string;
  count: number;
  images: number;
  videos: number;
  lastTs: number;
  bytes: number;
  avatar?: string;
}

const KEY = "xmd_history_v1";
const CAP = 2000;

let list: HistoryRecord[] | null = null;
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** 启动时装载（initStores → initHistory），扩展页与内容脚本读同一份 */
export async function initHistory(): Promise<void> {
  if (loaded) return;
  try {
    list = JSON.parse((await rawGet(KEY)) || "[]") as HistoryRecord[];
  } catch {
    list = [];
  }
  loaded = true;
}

function ensure(): HistoryRecord[] {
  if (loaded) return list!;
  // 扩展存储只能异步读取；早期 UI 读取不能把空缓存标记为已加载。
  if (inExt()) return list ??= [];
  try {
    list = JSON.parse(rawGetSync(KEY) || "[]") as HistoryRecord[];
  } catch {
    list = [];
  }
  loaded = true;
  return list;
}

function schedule(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      rawSet(KEY, JSON.stringify(ensure()));
    } catch { /* ignore */ }
  }, 800);
}

export function getHistory(): HistoryRecord[] {
  return ensure();
}

export function addHistory(rec: Omit<HistoryRecord, "id">): void {
  const l = ensure();
  l.push({ ...rec, id: `${rec.ts.toString(36)}_${l.length}` });
  if (l.length > CAP) list = l.slice(l.length - CAP);
  schedule();
}

export function clearHistoryAll(): number {
  const n = ensure().length;
  list = [];
  schedule();
  return n;
}

/** 清除某博主的历史，返回被移除的记录（用于同步去重库） */
export function clearHistoryUser(user: string): HistoryRecord[] {
  const l = ensure();
  const kept = l.filter(r => r.user !== user);
  const removed = l.filter(r => r.user === user);
  if (removed.length) {
    list = kept;
    schedule();
  }
  return removed;
}

// ─── 统计 ───────────────────────────────────────────────

export function computeStats(): { total: number; today: number; users: number; bytes: number } {
  const l = ensure();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const users = new Set<string>();
  let bytes = 0;
  let today = 0;
  for (const r of l) {
    if (r.user) users.add(r.user);
    bytes += r.bytes || 0;
    if (r.ts >= dayStart.getTime()) today++;
  }
  return { total: l.length, today, users: users.size, bytes };
}

/** 最近 n 天每日计数（含今天），label = MM-DD */
export function perDay(n: number): { label: string; count: number; isToday: boolean }[] {
  const l = ensure();
  const buckets = new Map<string, number>();
  const days: { label: string; count: number; isToday: boolean }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const label = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    buckets.set(d.toDateString(), 0);
    days.push({ label, count: 0, isToday: i === 0 });
  }
  const idxByDay = new Map(days.map((d, i) => [d.label, i]));
  for (const r of l) {
    const d = new Date(r.ts);
    const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const sameDay = buckets.has(new Date(d.getFullYear(), d.getMonth(), d.getDate()).toDateString());
    if (sameDay) {
      const i = idxByDay.get(key);
      if (i !== undefined) days[i].count++;
    }
  }
  return days;
}

/** 按博主聚合（跳过无 user 的早期记录），默认按张数降序 */
export function perUser(sort: "count" | "recent" = "count"): UserAgg[] {
  const agg = new Map<string, UserAgg>();
  for (const r of ensure()) {
    if (!r.user) continue;
    let a = agg.get(r.user);
    if (!a) {
      a = { user: r.user, count: 0, images: 0, videos: 0, lastTs: 0, bytes: 0 };
      agg.set(r.user, a);
    }
    a.count++;
    if (r.type === "video") a.videos++;
    else a.images++;
    a.lastTs = Math.max(a.lastTs, r.ts);
    a.bytes += r.bytes || 0;
    if (!a.avatar && r.avatar) a.avatar = r.avatar;
  }
  const arr = [...agg.values()];
  arr.sort((a, b) => (sort === "count" ? b.count - a.count : b.lastTs - a.lastTs));
  return arr;
}

/** 记录时间 → MM-DD 标签（与 perDay 的柱一致） */
export function dayLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 某天的全部记录（日柱点击过滤用） */
export function recordsForDay(label: string): HistoryRecord[] {
  return ensure().filter(r => dayLabel(r.ts) === label);
}

/** 备份恢复：整体替换并持久化 */
export async function replaceAllHistory(next: HistoryRecord[]): Promise<void> {
  list = (Array.isArray(next) ? next : []).slice(-CAP);
  loaded = true;
  await rawSet(KEY, JSON.stringify(list));
}

/** 某博主的记录，时间倒序 */
export function byUser(user: string): HistoryRecord[] {
  return ensure()
    .filter(r => r.user === user)
    .sort((a, b) => b.ts - a.ts);
}
