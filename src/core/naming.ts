// 命名引擎：令牌模板 → 文件名 / 目录路径。
// 令牌：{user} 博主名 · {date} YYYY-MM-DD · {time} HH-mm-ss · {seq} 流水号
//       {id} 推文ID末6位 · {month} YYYY-MM
// {seq} 的语义 = 同目录内、同博文发布日的计数（持久化，跨会话累加）。

import type { MediaItem } from "./types";
import type { XmdSettings } from "./settings";
import { fmtDate, getExt, sanitize } from "./utils";

export interface NamingContext {
  username?: string;
  tweetTime?: Date | null;
  /** 序号；为 null 表示“当天只发一张，不加序号” */
  seq?: number | null;
  tweetId?: string;
  tweetText?: string;
}

/**
 * 清洗推文正文文本用于文件名：
 * 1. 过滤所有 http/https 链接（如 t.co 短链）
 * 2. 过滤所有 Unicode Emoji 表情符号
 * 3. 换行与制表符转为空格
 * 4. 过滤系统保留/非法文件名字符: < > : " / \ | ? * 以及控制字符
 * 5. 合并连续空白与下划线，按字数截断并去除首尾空白
 */
export function cleanTweetText(text?: string, maxLen = 30): string {
  if (!text) return "";
  let s = text;
  // 1. 过滤链接（含短链与普通 URL）
  s = s.replace(/https?:\/\/\S+/gi, "");
  // 2. 过滤各类 Emoji 表情符（含通用符号与修饰符）
  s = s.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, "");
  // 3. 换行与制表符转为空格
  s = s.replace(/[\r\n\t]+/g, " ");
  // 4. 剔除操作系统保留/非法文件名字符及控制符
  s = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
  // 5. 替换特殊符号，合并连续空格/下划线
  s = s.replace(/[\s_]+/g, " ").trim();
  // 6. 字数安全截断
  if (maxLen > 0 && s.length > maxLen) {
    s = s.slice(0, maxLen).trim();
  }
  return s;
}

export function formatMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** 模板 → 基础名（不含扩展名，未 sanitize） */
export function formatTemplate(template: string, ctx: NamingContext, settings?: XmdSettings): string {
  const d = ctx.tweetTime ?? null;
  const maxLen = settings?.naming?.maxTextLength ?? 30;
  const cleanedText = cleanTweetText(ctx.tweetText, maxLen);

  let tpl = template;

  // 处理 {text} 令牌或自动追加推文文本
  if (tpl.includes("{text}")) {
    if (cleanedText) {
      tpl = tpl.replaceAll("{text}", cleanedText);
    } else {
      // 无文本时优雅降级：剔除 {text} 及其相邻一个分隔符，避免留下悬挂的 "_"
      tpl = tpl
        .replace(/[_\-. ]\{text\}/, "")
        .replace(/\{text\}[_\-. ]/, "")
        .replace(/\{text\}/, "");
    }
  } else if (settings?.naming?.includeText !== false && cleanedText) {
    // 模板未显式写 {text} 且开启了包含推文文本：自动追加到末尾
    tpl = `${tpl}_${cleanedText}`;
  }

  // 无序号（当天只发一张）时移除 {seq} 及其相邻一个分隔符，避免留下悬挂的 "_"
  if (ctx.seq == null) {
    tpl = tpl
      .replace(/[_\-. ]\{seq\}/, "")
      .replace(/\{seq\}[_\-. ]/, "")
      .replace(/\{seq\}/, "");
  }

  return tpl
    .replaceAll("{user}", ctx.username || "unknown")
    .replaceAll("{date}", d ? fmtDate(d) : "unknown")
    .replaceAll("{month}", d ? formatMonth(d) : "unknown")
    .replaceAll("{time}", d ? formatTime(d) : "00-00-00")
    .replaceAll("{id}", (ctx.tweetId || "").slice(-6) || "000000")
    .replaceAll("{seq}", ctx.seq != null ? String(ctx.seq).padStart(3, "0") : "");
}

/** 生成最终文件名（sanitize + 真实扩展名） */
export function buildFileName(
  template: string,
  ctx: NamingContext,
  url: string,
  type: MediaItem["type"],
  settings?: XmdSettings,
): string {
  const ext = getExt(url, type === "video" ? "video/" : "image/jpeg");
  const base = sanitize(formatTemplate(template, ctx, settings)).replace(/_{2,}/g, "_");
  return `${base || "x_media"}.${ext}`;
}

/** 目录分段（每段已 sanitize），[] 表示不建文件夹 */
export function folderSegments(settings: XmdSettings, ctx: NamingContext): string[] {
  const { mode, customTemplate } = settings.folders;
  const user = sanitize(ctx.username || "unknown");
  const month = ctx.tweetTime ? formatMonth(ctx.tweetTime) : "unknown";
  switch (mode) {
    case "none":
      return [];
    case "username":
      return [user];
    case "month":
      return [month];
    case "user-month":
      return [user, month];
    case "custom":
      return customTemplate
        .split("/")
        .map(seg => sanitize(formatTemplate(seg, ctx)))
        .filter(Boolean);
    default:
      return [];
  }
}

/** 按天计数的分组键 = 目录路径 + 发布日（“同文件夹同天 +1”） */
export function seqGroupKey(settings: XmdSettings, ctx: NamingContext, segments = folderSegments(settings, ctx)): string {
  const path = segments.join("/");
  return `${path}|${ctx.tweetTime ? fmtDate(ctx.tweetTime) : "unknown"}`;
}

/**
 * 批量重编号：组内按时间倒序，seq 从该组持久化计数之后续编，
 * getBase 可仅读取计数（预览），也可同步预留组内所需的 count 个编号（正式下载）。
 */
export function renumberByTimeline(
  items: MediaItem[],
  settings: XmdSettings,
  getBase: (group: string, count: number) => number,
  resolveSegments = (ctx: NamingContext) => folderSegments(settings, ctx),
): Map<string, number> {
  const groups = new Map<string, MediaItem[]>();
  for (const it of items) {
    const ctx: NamingContext = { username: it.username, tweetTime: it.tweetTime, tweetId: it.tweetId, tweetText: it.tweetText };
    const key = seqGroupKey(settings, ctx, resolveSegments(ctx));
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }

  const maxSeq = new Map<string, number>();
  for (const [key, arr] of groups) {
    arr.sort((a, b) => {
      if (!a.tweetTime && !b.tweetTime) return 0;
      if (!a.tweetTime) return 1;
      if (!b.tweetTime) return -1;
      return b.tweetTime.getTime() - a.tweetTime.getTime();
    });
    const base = getBase(key, arr.length);
    // 当天只发一张（组内仅 1 条且无历史计数）时文件名不带序号；两张以上才从 001 计数
    const single = arr.length === 1 && base === 0;
    arr.forEach((it, i) => {
      const seq = base + i + 1;
      it.sequence = seq;
      it.fileName = buildFileName(
        settings.naming.template,
        {
          username: it.username,
          tweetTime: it.tweetTime,
          seq: single ? null : seq,
          tweetId: it.tweetId,
          tweetText: it.tweetText,
        },
        it.url,
        it.type,
        settings,
      );
      it.timelineLabel = it.tweetTime ? fmtDate(it.tweetTime) : "未知日期";
    });
    maxSeq.set(key, base + arr.length);
  }
  return maxSeq;
}
