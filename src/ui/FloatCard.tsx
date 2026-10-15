// 博主主页右下角悬浮卡（设计稿 v-final）：
// 卡片在上（X 图标 + 名字✓ + @handle·帖子数 + 对齐分割线 + meta 行）
// 胶囊在下（推送下载 + 待更新角标），离底 54px，不重叠。

import { useEffect, useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import { useXmd } from "@/core/engine";
import { scrapeProfile, type ProfileInfo } from "@/core/profile";
import { perDay, perUser } from "@/core/history";
import { fetchUserMediaPage, findApiTemplate } from "@/core/api";
import { mediaKey } from "@/core/utils";
import { hasRecord } from "@/core/store";
import { cn } from "@/lib/utils";

/** 待更新数会话缓存：user → {ts, n}，10 分钟有效，避免连看博主时重复请求 */
const pendingCache = new Map<string, { ts: number; n: number }>();
const PENDING_TTL = 10 * 60 * 1000;

const X_LOGO =
  "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";
const DL_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const SPIN_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" style="animation:xmdspin .8s linear infinite"><path d="M21 12a9 9 0 11-6.2-8.56"/></svg>';
const CHECK_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

/** 路由轮询（SPA 切换时重抓博主信息） */
function useRoute(): string {
  const [route, setRoute] = useState(location.pathname);
  useEffect(() => {
    const t = setInterval(() => {
      if (location.pathname !== route) setRoute(location.pathname);
    }, 800);
    return () => clearInterval(t);
  }, [route]);
  return route;
}

export function FloatCard() {
  const s = useXmd();
  const route = useRoute();
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // 推送完成态：pushActive 由真变假且有过下载 → 显示「已更新 N」2.5 秒
  const [doneN, setDoneN] = useState<number | null>(null);
  const prevPush = useRef(false);
  useEffect(() => {
    if (prevPush.current && !s.pushActive && s.dlTotal > 0) {
      prevPush.current = false;
      setDoneN(s.dlDone);
      const t = setTimeout(() => setDoneN(null), 2500);
      return () => clearTimeout(t);
    }
    prevPush.current = s.pushActive;
  }, [s.pushActive, s.dlDone, s.dlTotal]);

  // 短视口且面板展开时悬浮卡左移避让，防重叠
  const [cramped, setCramped] = useState(() => window.innerHeight < 700);
  useEffect(() => {
    const on = () => setCramped(window.innerHeight < 700);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // X 头部 DOM 可能晚于路由渲染：只抓到 username 时重试几次
  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      if (!alive) return;
      const p = scrapeProfile();
      if (p && !p.name && !p.posts && tries < 5) {
        tries++;
        timer = setTimeout(attempt, 700);
        return;
      }
      setProfile(p);
    };
    attempt();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [route]);

  const downloaded = useMemo(() => {
    if (!profile?.username) return 0;
    return perUser("count").find(u => u.user === profile.username)?.count || 0;
    // storeCount 变化（新下载）时同步刷新
  }, [profile, route, s.storeCount]);

  // 最近 7 天下载火花线
  const spark = useMemo(() => perDay(7), [route, s.storeCount]);
  const maxSpark = Math.max(...spark.map(d => d.count), 1);

  // 静默预检「待更新 N」：会话缓存优先；无缓存拉一页 UserMedia 对比去重库；失败静默
  useEffect(() => {
    let alive = true;
    setPending(null);
    if (!s.settings.float.showPending || !profile?.username) return;
    const user = profile.username;
    const hit = pendingCache.get(user);
    if (hit && Date.now() - hit.ts < PENDING_TTL) {
      setPending(hit.n);
      return;
    }
    (async () => {
      const tpl = findApiTemplate(profile.username);
      if (!tpl) return;
      const parsed = await fetchUserMediaPage(tpl, tpl.userId, null).catch(() => null);
      if (!parsed || !alive) return;
      const n = parsed.items.filter(m => !hasRecord(mediaKey(m.url))).length;
      pendingCache.set(user, { ts: Date.now(), n });
      setPending(n);
    })();
    return () => {
      alive = false;
    };
  }, [route, s.settings.float.showPending, profile?.username]);

  if (!s.settings.float.enabled || !profile?.username) return null;

  const onPush = async () => {
    if (busy) return;
    setBusy(true);
    await s.pushDownload();
    setBusy(false);
  };

  const showPendingBadge = pending !== null && pending > 0;

  // 订阅推送：★ 关注/取关当前博主
  const watched = !!profile?.username && s.settings.watch.users.includes(profile.username);
  const toggleWatch = () => {
    if (!profile?.username) return;
    const users = s.settings.watch.users;
    s.setSettings({
      watch: { users: watched ? users.filter(u => u !== profile.username) : [...users, profile.username] },
    });
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: "xmd-sub-sync" }).catch(() => {});
    }
    s.toast(watched ? `已取关 ${profile.username}` : `已关注 ${profile.username}，订阅推送将定时访问`, watched ? "info" : "success");
  };

  return (
    <div className={cn("float-wrap", cramped && !s.collapsed && "float-left")}>
      <div className="fcard">
        <div className="frow">
          <svg className="fxico" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d={X_LOGO} />
          </svg>
          <div>
            <div className="fname">
              {profile.name || profile.username}
              {profile.verified && <span className="vf">✓</span>}
            </div>
            <div className="fhandle">
              @{profile.username}
              {profile.posts ? ` · ${profile.posts}` : ""}
            </div>
          </div>
          <button
            onClick={toggleWatch}
            title={watched ? "取关（停止订阅推送）" : "关注（订阅推送将定时访问）"}
            className={cn(
              "ib ml-auto h-7 w-7 flex-shrink-0",
              watched ? "text-amber-500 hover:text-amber-600" : "text-[var(--stage-muted)] hover:text-amber-500",
            )}
          >
            <Star className="h-4 w-4" strokeWidth={1.5} fill={watched ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="fbody">
          <div className="fdiv"></div>
          <div className="fmeta">
            <span>已下载 <strong className="font-medium text-[var(--stage-fg)] tabular-nums">{downloaded}</strong></span>
            {showPendingBadge && (
              <>
                <span className="text-[var(--divider)]">·</span>
                <span className="new tabular-nums">待更新 {pending}</span>
              </>
            )}
            {/* 7 天迷你火花线 */}
            <span className="fspark" title="最近 7 天下载">
              {spark.map(d => (
                <i
                  key={d.label}
                  style={{ height: `${Math.max(14, Math.round((d.count / maxSpark) * 100))}%` }}
                />
              ))}
            </span>
          </div>
        </div>
      </div>
      <button
        className={cn("fpill", doneN !== null && "done")}
        onClick={() => void onPush()}
        disabled={busy || s.pushActive}
      >
        {doneN !== null ? (
          <>
            {/* 完成态：绿勾 + 计数，2.5 秒后回落 */}
            <span className="ic ok" dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />
            已更新 {doneN}
          </>
        ) : s.pushActive ? (
          <>
            {/* 管线进行中：图标转圈 + 文字实时计数 */}
            <span className="ic" dangerouslySetInnerHTML={{ __html: SPIN_ICON }} />
            {s.isDownloading ? `已下载 ${s.dlDone}/${s.dlTotal}` : `加载 ${s.items.length}`}
          </>
        ) : (
          <>
            <span className="ic" dangerouslySetInnerHTML={{ __html: busy ? SPIN_ICON : DL_ICON }} />
            推送下载
            {showPendingBadge && <span className="n">{pending}</span>}
          </>
        )}
      </button>
    </div>
  );
}
