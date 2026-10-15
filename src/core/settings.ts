// 设置中心：默认值 + 持久化（chrome.storage.local，非扩展环境回退 localStorage）
// 引擎与 UI 通过 zustand store 里的 settings 镜像消费本模块。

export interface NamingSettings {
  /** 文件名令牌模板，如 "{date}_{seq}"、"{user}_{date}_{seq}" */
  template: string;
  /** 是否将推文正文附带文字加入文件名 */
  includeText: boolean;
  /** 正文文字截断最大字数（默认 30，范围 10~80） */
  maxTextLength: number;
}

export type FolderMode = "none" | "username" | "month" | "user-month" | "custom";

export interface FolderSettings {
  mode: FolderMode;
  /** mode=custom 时的目录模板，可用 / 分层，如 "{user}/{month}" */
  customTemplate: string;
}

export interface InlineButtonSettings {
  /** 是否启用页内媒体 hover 下载按钮 */
  enabled: boolean;
  /** 悬停显示（true）或常显（false） */
  hoverOnly: boolean;
  /** 视频/GIF 上也显示 */
  onVideos: boolean;
  /** 点击行为：直接下载 / 加入面板队列 */
  clickAction: "download" | "queue";
  /** 右键菜单「用 X Media 下载」 */
  contextMenu: boolean;
}

export type VideoQuality = "max" | "balanced" | "save";

/** 视频码率上限（bps）：最高 / 平衡 720p 档 / 省流 480p 档 */
export const VIDEO_CAPS: Record<VideoQuality, number> = {
  max: Infinity,
  balanced: 832000,
  save: 320000,
};

export interface DownloadSettings {
  concurrency: number;
  /** 兼容旧备份；已下载媒体现在始终自动排除，不再由界面开关控制。 */
  skipDownloaded: boolean;
  retry: boolean;
  videoQuality: VideoQuality;
  /** 只下载最近 N 天发布的媒体（0 = 不限；tweetTime 缺失的不过滤） */
  maxAgeDays: number;
}

export interface FloatSettings {
  /** 博主主页右下角悬浮卡总开关 */
  enabled: boolean;
  /** 静默预检并显示「待更新 N」角标 */
  showPending: boolean;
}

/** 下载动画主题 id：新增主题在 ui/anim/themes.ts 注册 */
export type AnimThemeId = "dotcut" | "marquee" | "matrix";

export interface AnimSettings {
  /** 下载时是否启用下载动画接管面板 */
  enabled: boolean;
  theme: AnimThemeId;
}

export interface WatchSettings {
  /** 订阅推送总开关 */
  enabled: boolean;
  /** 检查间隔（分钟） */
  intervalMin: number;
  /** 关注的博主列表 */
  users: string[];
}

export interface XmdSettings {
  naming: NamingSettings;
  folders: FolderSettings;
  inline: InlineButtonSettings;
  download: DownloadSettings;
  float: FloatSettings;
  anim: AnimSettings;
  watch: WatchSettings;
}

export const DEFAULT_SETTINGS: XmdSettings = {
  naming: { template: "{date}_{seq}", includeText: true, maxTextLength: 30 },
  folders: { mode: "username", customTemplate: "{user}" },
  inline: { enabled: true, hoverOnly: true, onVideos: true, clickAction: "download", contextMenu: true },
  download: { concurrency: 3, skipDownloaded: true, retry: true, videoQuality: "max", maxAgeDays: 0 },
  float: { enabled: true, showPending: true },
  anim: { enabled: true, theme: "dotcut" },
  watch: { enabled: false, intervalMin: 30, users: [] },
};

export const NAMING_PRESETS: { label: string; template: string }[] = [
  { label: "时间+编号", template: "{date}_{seq}" },
  { label: "时间+文字", template: "{date}_{seq}_{text}" },
  { label: "博主+时间", template: "{user}_{date}_{seq}" },
  { label: "博主+时间+ID", template: "{user}_{date}_{id}_{seq}" },
];

const KEY = "xmd_settings_v1";

function inExtension(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
}

function mergeSection<T extends object>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object") return base;
  return { ...base, ...(patch as Partial<T>) };
}

/** 设置补丁：各节独立可选、节内字段可选 */
export type SettingsPatch =
  | Partial<XmdSettings>
  | {
      naming?: Partial<NamingSettings>;
      folders?: Partial<FolderSettings>;
      inline?: Partial<InlineButtonSettings>;
      download?: Partial<DownloadSettings>;
      float?: Partial<FloatSettings>;
      anim?: Partial<AnimSettings>;
      watch?: Partial<WatchSettings>;
    };

/** 浅层分节合并：顶层各节独立浅合并，未提供的节保持原值 */
export function mergeSettings(base: XmdSettings, patch: SettingsPatch): XmdSettings {
  return {
    naming: mergeSection(base.naming, patch.naming),
    folders: mergeSection(base.folders, patch.folders),
    inline: mergeSection(base.inline, patch.inline),
    download: mergeSection(base.download, patch.download),
    float: mergeSection(base.float, patch.float),
    anim: mergeSection(base.anim, patch.anim),
    watch: mergeSection(base.watch, patch.watch),
  };
}

export async function loadSettings(): Promise<XmdSettings> {
  try {
    if (inExtension()) {
      const r = await chrome.storage.local.get(KEY);
      if (r[KEY]) return mergeSettings(DEFAULT_SETTINGS, r[KEY]);
    } else {
      const raw = localStorage.getItem(KEY);
      if (raw) return mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw));
    }
  } catch (e) {
    console.warn("[XMD] 设置读取失败，使用默认值:", e);
  }
  return structuredClone(DEFAULT_SETTINGS);
}

export function saveSettings(settings: XmdSettings): void {
  try {
    if (inExtension()) {
      void chrome.storage.local.set({ [KEY]: settings });
    } else {
      localStorage.setItem(KEY, JSON.stringify(settings));
    }
  } catch (e) {
    console.warn("[XMD] 设置保存失败:", e);
  }
}

/** 跨标签页/后台的设置变更订阅（options 页或多窗口场景） */
export function onSettingsChanged(cb: (next: XmdSettings) => void): () => void {
  if (!inExtension() || !chrome.storage?.onChanged) return () => {};
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[KEY]?.newValue) cb(changes[KEY].newValue as XmdSettings);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
