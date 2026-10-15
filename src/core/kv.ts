// 存储适配器：扩展环境 chrome.storage.local（扩展页与内容脚本共享），
// 非扩展环境回退 localStorage。所有持久化库（去重/计数/历史）共用。

export function inExt(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id;
}

export async function rawGet(key: string): Promise<string | null> {
  if (inExt()) {
    const r = await chrome.storage.local.get(key);
    return (r[key] as string) ?? null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function rawSet(key: string, val: string): Promise<void> {
  if (inExt()) return chrome.storage.local.set({ [key]: val });
  try {
    localStorage.setItem(key, val);
  } catch { /* ignore */ }
  return Promise.resolve();
}

/** 同步读（仅非扩展环境的未初始化兜底） */
export function rawGetSync(key: string): string | null {
  if (inExt()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
