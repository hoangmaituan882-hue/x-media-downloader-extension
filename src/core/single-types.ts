// SingleInput 的共享类型放在 engine 会形成 injector→engine→… 的循环引用风险，
// 这里独立导出供 injector 使用（engine 也 re-export 同一形状）。
export type { MediaType } from "./types";
import type { MediaType } from "./types";

export interface SingleInput {
  url: string;
  type: MediaType;
  thumbnail?: string;
  username?: string;
  tweetId?: string;
  tweetTime: Date | null;
  avatar?: string;
  tweetText?: string;
}
