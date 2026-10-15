export type MediaType = "image" | "video";
export type MediaSource = "img_tag" | "video_tag" | "data_attr" | "api" | "inline";
export type MediaStatus = "pending" | "loading" | "done" | "error";
export type FilterKind = "all" | MediaType;
export type MediaViewKind = "list" | "card" | "tweet" | "pack";
export type ToastKind = "info" | "success" | "warning" | "error";

export interface MediaItem {
  id: string;
  type: MediaType;
  url: string;
  thumbnail: string;
  fileName: string;
  status: MediaStatus;
  source: MediaSource;
  tweetTime: Date | null;
  timelineLabel?: string;
  sequence?: number;
  /** 正式下载时锁定的目标目录；重试与界面重新编号均保留已占用的文件名。 */
  downloadSegments?: string[];
  selected: boolean;
  /** 已确认保存（包含当前会话的下载），展示状态并排除勾选。 */
  savedBefore?: boolean;
  error?: string;
  /** 推文作者（命名 {user} / 目录按博主分组用） */
  username?: string;
  /** 推文 ID（命名 {id} 用） */
  tweetId?: string;
  /** 博主头像 URL（历史/画廊展示用） */
  avatar?: string;
  /** 推文附带正文文字（命名 {text} 用） */
  tweetText?: string;
}

export interface PageContext {
  type: "profile_media" | "single_tweet" | "profile_home" | "search" | "other";
  username?: string;
  tweetId?: string;
  query?: string;
}

export interface ToastMsg {
  id: string;
  text: string;
  kind: ToastKind;
  created: number;
}
