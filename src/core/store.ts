// 去重库 + 按天计数库。
// 存储适配：扩展环境用 chrome.storage.local（扩展页面与内容脚本共享），
// 非扩展环境（本地测试页）回退 localStorage。启动时 await initStores()。

import { inExt, rawGet, rawGetSync, rawSet } from "./kv";
import { initHistory } from "./history";

const KEY = "xmd_downloaded_v1";
const SEQ_KEY = "xmd_seq_v1";

let store: Map<string, number> = new Map();
let seqMap: Record<string, number> = {};
let ready = false;
let loading: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let seqSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** 启动时调用（内容脚本 / 画廊页）：异步装载三库（去重/计数/历史） */
export async function initStores(): Promise<void> {
  if (ready) return;
  if (loading) return loading;
  loading = loadStores();
  return loading;
}

async function loadStores(): Promise<void> {
  try {
    const raw = await rawGet(KEY);
    store = new Map(raw ? (JSON.parse(raw) as [string, number][]) : []);
  } catch {
    store = new Map();
  }
  try {
    seqMap = JSON.parse((await rawGet(SEQ_KEY)) || "{}") as Record<string, number>;
  } catch {
    seqMap = {};
  }
  await initHistory();
  ready = true;
}

/** 未 init 时的同步兜底（仅非扩展环境有效；扩展环境启动流程保证已 init） */
function ensureLoaded(): void {
  if (ready || loading || inExt()) return;
  try {
    store = new Map(JSON.parse(rawGetSync(KEY) || "[]") as [string, number][]);
    seqMap = JSON.parse(rawGetSync(SEQ_KEY) || "{}") as Record<string, number>;
  } catch {
    store = new Map();
    seqMap = {};
  }
  ready = true;
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    rawSet(KEY, JSON.stringify([...store.entries()]));
  }, 800);
}

function scheduleSeqSave(): void {
  if (seqSaveTimer) return;
  seqSaveTimer = setTimeout(() => {
    seqSaveTimer = null;
    rawSet(SEQ_KEY, JSON.stringify(seqMap));
  }, 800);
}

// ─── 去重库 ───────────────────────────────────────────────

export function storeSize(): number {
  ensureLoaded();
  return store.size;
}

export function hasRecord(key: string): boolean {
  ensureLoaded();
  return store.has(key);
}

export function addRecord(key: string): void {
  ensureLoaded();
  store.set(key, Date.now());
  scheduleSave();
}

export function clearRecords(): number {
  ensureLoaded();
  const n = store.size;
  store.clear();
  rawSet(KEY, "[]");
  return n;
}

/** 按博主清除历史时同步移除对应去重记录 */
export function removeRecords(keys: string[]): void {
  if (!keys.length) return;
  ensureLoaded();
  for (const k of keys) store.delete(k);
  scheduleSave();
}

// ─── 按天计数（{seq} 跨会话不重名） ────────────────────────

export function getSeqBase(group: string): number {
  ensureLoaded();
  return seqMap[group] || 0;
}

export function bumpSeqTo(group: string, n: number): void {
  ensureLoaded();
  if (n > (seqMap[group] || 0)) {
    seqMap[group] = n;
    scheduleSeqSave();
  }
}

/** 下载开始前同步占用一段编号；失败也不回收，避免并发任务复用文件名。 */
export function reserveSeq(group: string, count: number): number {
  const base = getSeqBase(group);
  bumpSeqTo(group, base + count);
  return base;
}

/** 备份用：导出计数表 */
export function dumpSeq(): Record<string, number> {
  ensureLoaded();
  return { ...seqMap };
}

/** 备份恢复：整体替换并持久化 */
export async function replaceAllSeq(next: Record<string, number>): Promise<void> {
  seqMap = next && typeof next === "object" ? next : {};
  ready = true;
  await rawSet(SEQ_KEY, JSON.stringify(seqMap));
}
