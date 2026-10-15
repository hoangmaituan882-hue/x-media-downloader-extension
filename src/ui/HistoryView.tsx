// 历史视图：仪表盘 → 14 天趋势 → 博主榜（手风琴下钻）→ 操作。
// 视觉沿用设计稿（styles.css 中 #xmd-root 作用域样式）。

import { useContext, useMemo, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, Download, ExternalLink, FileText, Film, Images, Trash2 } from "lucide-react";
import { PortalRootContext } from "./context";
import { useHoverPreview } from "./useHoverPreview";
import { useXmd } from "@/core/engine";
import {
  byUser, computeStats, dayLabel, getHistory, perDay, perUser, recordsForDay,
  type HistoryRecord, type UserAgg,
} from "@/core/history";
import { cn } from "@/lib/utils";

/** 缩略图 DOM 注册表：关闭预览时先把目标滚进可视区，回飞才看得见 */
const thumbRefs = new Map<string, HTMLElement>();
import { avatarColor, fmtBytes, mediaKey, relTime } from "@/core/utils";
import { HoldActionButton } from "@/components/motion/hold-action-button";
import { NumberTicker } from "@/components/motion/number-ticker";
import { DURATION_FAST, DURATION_QUICK, EASE_SMOOTH_OUT } from "@/lib/ease";

export function HistoryView() {
  const s = useXmd();
  const portalRoot = useContext(PortalRootContext);
  const [sort, setSort] = useState<"count" | "recent">("count");
  const [expanded, setExpanded] = useState<string | null>(null);
  const previewState = useHoverPreview<HistoryRecord>(record => {
    // 目标缩略图若滚出了面板可视区，先即时滚回，回飞动画才可见。
    thumbRefs.get(record.id)?.scrollIntoView({ block: "nearest" });
  });
  const preview = previewState.item;

  const stats = computeStats();
  const days = perDay(14);
  const maxDay = Math.max(...days.map(d => d.count), 1);
  const dayTotal = days.reduce((a, d) => a + d.count, 0);
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // 日柱过滤：选中某天时博主榜只统计当天
  const users = useMemo(() => {
    const base = dayFilter ? aggFrom(recordsForDay(dayFilter), sort) : perUser(sort);
    const qq = q.trim().toLowerCase();
    return qq ? base.filter(u => u.user.toLowerCase().includes(qq)) : base;
  }, [dayFilter, sort, s.storeCount, q]);
  const maxCount = Math.max(...users.map(u => u.count), 1);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(getHistory(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xmd-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    s.toast("已导出历史 JSON", "success");
  };

  // CSV：带 BOM，Excel 直开中文不乱码
  const exportCsv = () => {
    const rows: string[][] = [["user", "date", "type", "fileName", "tweetUrl", "url"]];
    for (const r of getHistory()) {
      rows.push([
        r.user || "",
        new Date(r.ts).toISOString(),
        r.type,
        r.fileName,
        r.tweetUrl || "",
        r.url,
      ]);
    }
    const csv = rows
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["" + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xmd-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    s.toast("已导出历史 CSV", "success");
  };

  return (
    <div>
      {/* 顶栏 */}
      <div className="xhd-top">
        <button className="xhd-back" title="返回主面板" onClick={() => s.setView("main")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="xhd-title">下载历史</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="搜索博主…"
          className="min-w-0 flex-1 rounded-lg bg-[var(--stage-surface)] px-2.5 py-1 text-xs text-[var(--stage-fg)] shadow-[0_0_0_1px_var(--stage-border)] outline-none focus:shadow-[0_0_0_3px_rgba(0,115,229,0.12),0_0_0_1px_rgba(0,83,227,0.8)] placeholder:text-[var(--stage-muted)]"
        />
        <button className="xhd-back" title="打开画廊（全部媒体）" onClick={() => openGallery("")}>
          <Images className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button className="xhd-back" title="导出 CSV" onClick={exportCsv}>
          <FileText className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button className="xhd-back" title="导出 JSON" onClick={exportJson}>
          <Download className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {stats.total === 0 ? (
        <div className="xhd-empty">
          还没有下载记录
          <br />
          <span>通过面板或页内按钮下载的媒体会在这里统计</span>
        </div>
      ) : (
        <>
          {/* 仪表盘 */}
          <div className="dash">
            <div>
              <NumberTicker value={stats.total} className="xhd-num" />
              <span className="lbl">总媒体</span>
            </div>
            <div>
              <NumberTicker value={stats.today} className="xhd-num v" />
              <span className="lbl">今日</span>
            </div>
            <div>
              <NumberTicker value={stats.users} className="xhd-num" />
              <span className="lbl">博主</span>
            </div>
            <div>
              <span className="xhd-num">{fmtBytes(stats.bytes)}</span>
              <span className="lbl">总体积</span>
            </div>
          </div>

          {/* 14 天趋势 */}
          <div className="chart-hd">
            <span className="l">最近 14 天</span>
            {dayFilter && (
              <button
                className="xhd-daychip"
                title="清除日期过滤"
                onClick={() => setDayFilter(null)}
              >
                {dayFilter} ✕
              </button>
            )}
            <span className="r">
              共 <b>{dayTotal}</b> 张
            </span>
          </div>
          <div className="chart">
            {days.map(d => (
              <div
                key={d.label}
                className={cn("bar", d.isToday && "today", dayFilter === d.label && "active")}
                style={{ height: `${Math.round((d.count / maxDay) * 100)}%` }}
                data-tip={`${d.label} · ${d.count}${d.isToday ? "（今天）" : ""} · 点击过滤`}
                onClick={() => setDayFilter(dayFilter === d.label ? null : d.label)}
              />
            ))}
          </div>
          <div className="axis">
            <span>{days[0]?.label}</span>
            <span>{days[7]?.label}</span>
            <span>今天</span>
          </div>

          {/* 博主榜 */}
          <div className="sec">
            <span className="l">博主榜</span>
            <div className="tabs">
              <button className={sort === "count" ? "on" : ""} onClick={() => setSort("count")}>
                按张数
              </button>
              <button className={sort === "recent" ? "on" : ""} onClick={() => setSort("recent")}>
                按最近
              </button>
            </div>
          </div>

          {users.map(u => (
            <motion.div
              key={u.user}
              layout
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                className="b-row"
                onClick={() => setExpanded(expanded === u.user ? null : u.user)}
              >
                <div className="fillbar" style={{ width: `${Math.round((u.count / maxCount) * 100)}%` }} />
                <div className="ava" style={u.avatar ? undefined : { background: avatarColor(u.user) }}>
                  {u.avatar ? (
                    <img src={u.avatar} alt="" loading="lazy" />
                  ) : (
                    u.user.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="b-name">
                  <div className="n">{u.user}</div>
                  <div className="s">
                    {relTime(u.lastTs)} · 图片 {u.images} / 视频 {u.videos}
                  </div>
                </div>
                <div className="b-cnt">
                  {u.count}
                  <small>{expanded === u.user ? " ▴" : " ▾"}</small>
                </div>
              </button>

              {/* 下钻高度动画：开闭不对称（展开 250ms 平滑减速，收起 150ms 干脆退出） */}
              <AnimatePresence initial={false}>
                {expanded === u.user && (
                  <motion.div
                    key="drill"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{
                      height: "auto",
                      opacity: 1,
                      transition: { duration: DURATION_FAST, ease: EASE_SMOOTH_OUT },
                    }}
                    exit={{
                      height: 0,
                      opacity: 0,
                      transition: { duration: DURATION_QUICK, ease: EASE_SMOOTH_OUT },
                    }}
                    style={{ overflow: "hidden" }}
                  >
                    <Drill
                      user={u.user}
                      onPreview={previewState.open}
                      onHoverPreview={previewState.enter}
                      onLeavePreview={previewState.leave}
                      day={dayFilter}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}

          {/* 危险操作区：清空全部历史（长按确认） */}
          <div style={{ marginTop: 12 }}>
            <HoldActionButton
              holdDuration={700}
              onHoldComplete={() => s.clearHistoryAll()}
              holdingLabel="按住确认"
              completeLabel="已清空"
              labelClassName="text-[11px]"
              className="h-9 min-w-0 w-full rounded-lg border border-red-200 bg-transparent px-3 text-red-600 hover:bg-red-50"
              style={{ "--hold-radius": "0.5rem" } as React.CSSProperties}
            >
              <Trash2 className="mr-1.5 inline h-3.5 w-3.5" />
              清空全部历史
            </HoldActionButton>
          </div>

        </>
      )}

      {/* 大图预览：portal 到 Shadow Root（面板有 transform/overflow 会困住 fixed 遮罩），
          与缩略图共享 layoutId，跨 portal 原位放大 morph；
          AnimatePresence 保证关闭时退出 morph 完整跑回缩略图 */}
      {createPortal(
        <AnimatePresence>
          {preview && (
            <motion.div
              key="pv"
              className="xhd-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: DURATION_FAST, ease: EASE_SMOOTH_OUT } }}
              exit={{ opacity: 0, transition: { duration: DURATION_QUICK, ease: EASE_SMOOTH_OUT } }}
              onClick={previewState.dismiss}
              onPointerMove={previewState.trackPointer}
              onPointerLeave={previewState.close}
            >
              <motion.div
                layoutId={`th-${preview.id}`}
                ref={previewState.previewRef}
                className="xhd-preview"
                onClick={e => e.stopPropagation()}
                onPointerEnter={previewState.cancelClose}
                onPointerLeave={previewState.trackPointer}
              >
                {preview.type === "image" ? (
                  <img src={`${mediaKey(preview.url)}?name=small`} alt="" />
                ) : (
                  <div className="xhd-preview-ph">
                    <Film className="h-6 w-6" />
                  </div>
                )}
                <div
              className="xhd-preview-name"
              title={preview.tweetUrl ? "打开原推文" : undefined}
              style={preview.tweetUrl ? { cursor: "pointer" } : undefined}
              onClick={() =>
                preview.tweetUrl && window.open(preview.tweetUrl, "_blank", "noopener")
              }
            >
              {preview.fileName}
            </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        portalRoot ?? document.body,
      )}
    </div>
  );

}

/** 下钻：最近缩略图 + 补下载/打开主页/清除记录 */
/** 画廊页：通过 background service worker 的 chrome.tabs.create 打开，避免页面沙箱 ERR_BLOCKED_BY_CLIENT */
function openGallery(user: string) {
  const q = "?user=" + encodeURIComponent(user);
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type: "xmd-open-gallery", query: q }).then(res => {
      if (!res?.ok) {
        window.open(chrome.runtime.getURL("gallery.html") + q, "_blank");
      }
    }).catch(() => {
      window.open(chrome.runtime.getURL("gallery.html") + q, "_blank");
    });
  } else {
    window.open("gallery.html" + q, "_blank");
  }
}

/** 从记录集按博主聚合（日柱过滤时复用） */
function aggFrom(recs: HistoryRecord[], sort: "count" | "recent"): UserAgg[] {
  const m = new Map<string, UserAgg>();
  for (const r of recs) {
    if (!r.user) continue;
    let a = m.get(r.user);
    if (!a) {
      a = { user: r.user, count: 0, images: 0, videos: 0, lastTs: 0, bytes: 0 };
      m.set(r.user, a);
    }
    a.count++;
    if (r.type === "video") a.videos++;
    else a.images++;
    a.lastTs = Math.max(a.lastTs, r.ts);
    a.bytes += r.bytes || 0;
    if (!a.avatar && r.avatar) a.avatar = r.avatar;
  }
  const arr = [...m.values()];
  arr.sort((a, b) => (sort === "count" ? b.count - a.count : b.lastTs - a.lastTs));
  return arr;
}

function Drill({
  user,
  onPreview,
  onHoverPreview,
  onLeavePreview,
  day,
}: {
  user: string;
  onPreview: (r: HistoryRecord, anchor: HTMLElement) => void;
  onHoverPreview?: (r: HistoryRecord, event: PointerEvent<HTMLElement>) => void;
  onLeavePreview?: (event: PointerEvent<HTMLElement>) => void;
  day: string | null;
}) {
  const s = useXmd();
  const recs = byUser(user).filter(r => !day || dayLabel(r.ts) === day);
  const shown = recs.slice(0, 5);

  return (
    <div className="drill">
      <div className="thumbs">
        {shown.map(r => (
          <motion.div
            key={r.id}
            layoutId={`th-${r.id}`}
            className="th cursor-zoom-in"
            ref={el => {
              if (el) thumbRefs.set(r.id, el);
              else thumbRefs.delete(r.id);
            }}
            onClick={e => onPreview(r, e.currentTarget)}
            onPointerEnter={e => onHoverPreview?.(r, e)}
            onPointerLeave={onLeavePreview}
          >
            {r.type === "image" ? (
              <img src={`${mediaKey(r.url)}?name=small`} loading="lazy" alt="" />
            ) : (
              <Film className="h-3 w-3" />
            )}
          </motion.div>
        ))}
        {recs.length > 5 && (
          <button className="more" title="在画廊页查看全部" onClick={() => openGallery(user)}>
            +{recs.length - 5}
          </button>
        )}
      </div>
      <div className="acts">
        <button className="pri" onClick={() => void s.redownloadUser(user)}>
          补下载 {recs.length}
        </button>
        <button onClick={() => window.open(`https://x.com/${user}`, "_blank", "noopener")}>
          <ExternalLink className="mr-1 inline h-3 w-3" />
          打开主页
        </button>
        <HoldActionButton
          holdDuration={700}
          onHoldComplete={() => s.clearHistoryUser(user)}
          holdingLabel="按住确认"
          completeLabel="已清除"
          labelClassName="text-[10.5px]"
          className="h-auto min-w-0 flex-1 rounded-md border border-red-200 bg-transparent px-2 py-1 text-red-600"
          style={{ "--hold-radius": "0.375rem" } as React.CSSProperties}
        >
          清除记录
        </HoldActionButton>
      </div>
    </div>
  );
}
