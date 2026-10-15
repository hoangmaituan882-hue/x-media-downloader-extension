import type { MediaType } from "./types";

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let idCounter = 0;
export function uid(prefix: string): string {
  return `${prefix}_${++idCounter}_${Date.now().toString(36)}`;
}

/** 安全化文件名 */
export function sanitize(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 200);
}

/** 媒体去重/记录键：去掉查询参数的 URL */
export const mediaKey = (url: string) => url.split("?")[0];

/**
 * 获取最高质量图片URL
 * v7.1重写：统一处理 name 参数，?format= 链接缺 name 时正确追加 name=orig
 */
export function getBestUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // blob:/data: 不是 twimg 直链（如 MSE 视频流），追加参数只会破坏它
  if (/^(blob:|data:)/i.test(url)) return url;
  // twimg 现在要求 name= 必须搭配 format= 才返回图片（缺 format 时 name=orig/name=small 直接 404）
  const withFmt = ensureImageFormat(url);
  if (/[?&]name=orig(?:&|$)/.test(withFmt)) return withFmt;
  if (/[?&]name=/.test(withFmt)) return withFmt.replace(/([?&])name=[^&]*/, "$1name=orig");
  return `${withFmt}${withFmt.includes("?") ? "&" : "?"}name=orig`;
}

/** 若为 twimg 图片直链且缺 format 参数，按扩展名补 format（jpg/png/gif/webp）；无法识别时兜底 jpg */
export function ensureImageFormat(url: string): string {
  if (/[?&]format=/i.test(url)) return url;
  if (!/twimg\.com\//i.test(url)) return url;
  const fmt = imageFormatOf(url) || "jpg";
  return `${url}${url.includes("?") ? "&" : "?"}format=${fmt}`;
}

/** 从 URL 扩展名推断图片格式（未知返回 null） */
export function imageFormatOf(url: string): string | null {
  const m = url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i);
  if (!m) return null;
  return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
}

/** twimg 缩略图 URL（确保带 format + name 参数） */
export function twimgThumb(url: string, name = "small"): string {
  const base = ensureImageFormat(url);
  if (/[?&]name=/.test(base)) return base.replace(/([?&])name=[^&]*/, `$1name=${name}`);
  return `${base}${base.includes("?") ? "&" : "?"}name=${name}`;
}

/** 头像 URL 归一化：统一到 _bigger 尺寸（73px）并去掉查询参数 */
export function normalizeAvatar(url: string): string {
  return url
    .replace(/_(mini|normal|bigger|x96)\./, "_bigger.")
    .replace(/_\d+x\d+\./, "_bigger.")
    .split("?")[0];
}

/** 从URL推断扩展名（真实格式检测，不再硬编码 jpg/mp4） */
export function getExt(url: string, type?: string): string {
  if (type?.startsWith("video/")) return "mp4";
  const fmtMatch = url.match(/format=(jpg|jpeg|png|webp|gif)/i);
  if (fmtMatch) return fmtMatch[1].toLowerCase();
  const extMatch = url.match(/\.(jpg|jpeg|png|webp|gif|mp4)(?:\?|$)/i);
  if (extMatch) return extMatch[1].toLowerCase();
  return type?.startsWith("image/gif") ? "gif" : "jpg";
}

/** 字节数 → 人类可读（1.2GB / 340MB / 12KB） */
export function fmtBytes(n: number): string {
  if (!n || n <= 0) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

/** 相对时间：刚刚 / N分钟前 / N小时前 / 昨天 / N天前 / 上周 */
export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "昨天";
  if (day < 7) return `${day} 天前`;
  if (day < 30) return "上周";
  return `${Math.floor(day / 30)} 个月前`;
}

/** 字符串哈希 → 调色板取色（博主头像） */
export function avatarColor(name: string): string {
  const palette = ["#8b5cf6", "#2563eb", "#ec4899", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#7c3aed"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

/** 格式化日期为 YYYY-MM-DD */
export function fmtDate(d: Date | null): string {
  if (!d) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 解码 Twitter Snowflake ID 为 Date */
export function decodeSnowflake(href: string | null): Date | null {
  try {
    if (!href) return null;
    const match = href.match(/\/status\/(\d{15,})/);
    if (!match) return null;
    const id = BigInt(match[1]);
    const TWITTER_EPOCH = 1288834974657n;
    const timestampMs = Number((id >> 22n) + TWITTER_EPOCH);
    const d = new Date(timestampMs);
    return d.getFullYear() >= 2010 && d.getFullYear() <= 2030 ? d : null;
  } catch {
    return null;
  }
}

// 时间线重编号已迁移至 naming.ts（令牌模板 + 按天持久化计数）
