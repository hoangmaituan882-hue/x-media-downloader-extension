// 下载通道，按优先级：
// 1. File System Access API（用户选了文件夹）→ 任意位置 + 多级子目录
// 2. chrome.downloads（扩展环境未选文件夹）→ 下载目录内自动建子目录
// 3. 浏览器 <a download>（非扩展环境兜底，不支持子目录）
// 媒体字节优先经后台抓取绕开 CORS（通道 1/3 共用 fetchMediaBlob）。

import { sleep } from "./utils";
import { resolveVideoUrl } from "./video-resolver";
import type { MediaItem } from "./types";

export const fsApiSupported =
  typeof window !== "undefined" &&
  !!(window as any).showDirectoryPicker &&
  !!(window as any).showOpenFilePicker;

function inExtension(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
}

/** Chrome runtime 消息采用 JSON；逐段解码并校验结束帧，避免损坏文件被记为成功。 */
function fetchViaBackground(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: "xmd-download" });
    } catch (e) {
      return reject(e);
    }
    let settled = false;
    const parts: ArrayBuffer[] = [];
    let bytes = 0;
    const finish = (error?: Error, blob?: Blob) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { port.disconnect(); } catch { /* ignore */ }
      if (error) reject(error);
      else resolve(blob!);
    };
    const timer = setTimeout(() => finish(new Error("下载超时")), 300000);
    port.onMessage.addListener((msg: any) => {
      if (settled) return;
      try {
        if (msg?.error) throw new Error(String(msg.error));
        if (msg?.type === "xmd-media-chunk" && msg.index === parts.length &&
            typeof msg.data === "string" && msg.data.length > 0 && msg.data.length <= 43692) {
          const part = Uint8Array.from(atob(msg.data), char => char.charCodeAt(0));
          if (!part.length || part.length > 32768) throw new Error("无效媒体分段");
          parts.push(part.buffer);
          bytes += part.length;
        } else if (msg?.type === "xmd-media-end" && msg.chunks === parts.length &&
                   msg.bytes === bytes && bytes > 0 && typeof msg.mime === "string") {
          finish(undefined, new Blob(parts, { type: msg.mime }));
        } else {
          throw new Error("媒体传输不完整或格式错误");
        }
      } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); }
    });
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      // 断连即失败，不要依赖 chrome.runtime.lastError（它可能为空导致 Promise 永久悬挂）
      finish(new Error(error?.message || "后台连接断开"));
    });
    try { port.postMessage({ url }); }
    catch (e) { finish(e instanceof Error ? e : new Error(String(e))); }
  });
}

/** 统一媒体抓取入口：扩展环境先走后台，失败或非扩展环境则直连 */
export async function fetchMediaBlob(url: string): Promise<Blob> {
  if (inExtension()) {
    try {
      return await fetchViaBackground(url);
    } catch (e: any) {
      console.warn("[XMD] 后台抓取失败，尝试直连:", e?.message);
    }
  }
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (window as any).showDirectoryPicker({ mode: "readwrite", startIn: "downloads" });
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    throw e;
  }
}

/** FS API 写入，segments 为多级子目录（逐级 create） */
export async function writeViaFS(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  url: string,
  segments: string[],
): Promise<{ success: boolean; error?: string; bytes?: number }> {
  try {
    let targetDir: FileSystemDirectoryHandle = dirHandle;
    for (const seg of segments) {
      // 逐级下钻：必须用上一级句柄取子目录，否则多段路径会建成平级兄弟目录
      targetDir = await targetDir.getDirectoryHandle(seg, { create: true });
    }
    const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as any).createWritable();
    const blob = await fetchMediaBlob(url);
    await writable.write(blob);
    await writable.close();
    return { success: true, bytes: blob.size };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/** 扩展环境：chrome.downloads 保存到下载目录（filename 可含子目录，重名自动 uniquify） */
function extensionDownload(url: string, filenameWithPath: string): Promise<{ success: boolean; error?: string; bytes?: number }> {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(
        { type: "xmd-download-file", url, filename: filenameWithPath },
        (resp: any) => {
          const err = chrome.runtime.lastError;
          if (err) return resolve({ success: false, error: err.message });
          resolve(resp?.ok ? { success: true, bytes: resp.bytes } : { success: false, error: resp?.error || "下载失败" });
        },
      );
    } catch (e: any) {
      resolve({ success: false, error: e?.message || String(e) });
    }
  });
}

/** 浏览器下载回退：fetch → Blob → ObjectURL（不支持子目录） */
export async function browserDownload(item: MediaItem): Promise<{ success: boolean; error?: string; fallbackOpen?: boolean; bytes?: number }> {
  try {
    const blob = await fetchMediaBlob(item.url);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = item.fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    return { success: true, bytes: blob.size };
  } catch (e: any) {
    try {
      window.open(item.url, "_blank", "noopener");
      return { success: true, fallbackOpen: true };
    } catch {
      return { success: false, error: e?.message || String(e) };
    }
  }
}

/** 统一下载入口：按通道优先级分发 */
export async function downloadItem(
  item: MediaItem,
  dirHandle: FileSystemDirectoryHandle | null,
  segments: string[],
): Promise<{ success: boolean; error?: string; bytes?: number }> {
  // blob 视频（MSE 流）换成真实 mp4 直链再下载
  const url = resolveVideoUrl(item.url, item.thumbnail);
  const path = segments.length ? `${segments.join("/")}/${item.fileName}` : item.fileName;

  // 图片：直接用 chrome.downloads 按 URL 下载（浏览器原生下载，字节可靠），
  // 不走后台抓取字节——后台 fetch twimg 图片可能返回空白/占位内容
  if (item.type === "image" && inExtension()) {
    return await extensionDownload(url, path);
  }

  // 视频：优先 FS API（mp4 直链 CORS 开放），失败回退 chrome.downloads
  if (dirHandle && fsApiSupported) {
    const r = await writeViaFS(dirHandle, item.fileName, url, segments);
    if (r.success) return r;
  }
  if (inExtension()) {
    return await extensionDownload(url, path);
  }
  return await browserDownload({ ...item, url });
}

/** 带一次重试的下载（retry 由设置控制） */
export async function downloadWithRetry(
  item: MediaItem,
  dirHandle: FileSystemDirectoryHandle | null,
  segments: string[],
  shouldStop: () => boolean,
  retry: boolean,
): Promise<{ success: boolean; error?: string; bytes?: number }> {
  let result = await downloadItem(item, dirHandle, segments);
  if (!result.success && retry && !shouldStop()) {
    await sleep(600);
    result = await downloadItem(item, dirHandle, segments);
  }
  return result;
}
