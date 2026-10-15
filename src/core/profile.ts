// 博主主页信息抓取（DOM，宽容失败：抓到什么展示什么）

import { getPageContext } from "./page";

export interface ProfileInfo {
  username?: string;
  name?: string;
  verified: boolean;
  posts?: string;
}

export function scrapeProfile(): ProfileInfo | null {
  const ctx = getPageContext();
  if (ctx.type !== "profile_media" && ctx.type !== "profile_home") return null;

  const name =
    document.querySelector('[data-testid="UserName"]')?.textContent?.trim().split("\n")[0] ||
    undefined;
  const verified = !!document.querySelector('[data-testid="icon-verified"]');
  const posts =
    document.querySelector('[data-testid="UserProfileHeader_Items"] span')?.textContent?.trim() ||
    undefined;

  return { username: ctx.username, name, verified, posts };
}
