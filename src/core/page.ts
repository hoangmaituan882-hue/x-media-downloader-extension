import type { PageContext } from "./types";

const RESERVED = [
  "home", "explore", "notifications", "messages", "compose", "settings",
  "search", "i", "hashtag", "bookmarks", "lists", "spaces", "premium", "help",
];

/** 获取页面上下文（用户媒体页 / 单条推文 / 用户主页 / 其他） */
export function getPageContext(): PageContext {
  const p = window.location.pathname;
  const mMedia = p.match(/^\/([^/]+)\/media\/?$/i);
  if (mMedia) return { type: "profile_media", username: mMedia[1] };
  const mStatus = p.match(/^\/[^/]+\/status\/(\d+)/i);
  if (mStatus) return { type: "single_tweet", tweetId: mStatus[1] };
  const mSearch = p.match(/^\/(search|hashtag)/i);
  if (mSearch) {
    const q = new URLSearchParams(window.location.search).get("q") || "";
    return { type: "search", query: q };
  }
  const mHome = p.match(/^\/([^/]+)\/?$/i);
  if (mHome && !RESERVED.includes(mHome[1].toLowerCase())) {
    return { type: "profile_home", username: mHome[1] };
  }
  return { type: "other" };
}

export function getScrollableElement(): HTMLElement {
  const candidates = [
    document.querySelector('[data-testid="primaryColumn"]'),
    document.querySelector('[role="main"]'),
    document.querySelector("main"),
    document.documentElement,
  ];
  for (const el of candidates) {
    if (el && el.scrollHeight > el.clientHeight) return el as HTMLElement;
  }
  return document.documentElement;
}

export function performScroll(el: HTMLElement, distance: number): void {
  try {
    if (el === document.documentElement) {
      window.scrollBy({ top: distance, behavior: "smooth" });
    } else {
      el.scrollBy({ top: distance, behavior: "smooth" });
    }
  } catch {
    el.scrollTop += distance;
  }
}
