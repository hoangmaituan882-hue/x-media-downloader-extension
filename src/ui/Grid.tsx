import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  ChevronRight,
  Download,
  ExternalLink,
  Film,
  Grid as GridIcon,
  Image as ImageIcon,
  Images as ImagesIcon,
  Layers,
  List as ListIcon,
  Package,
  Users,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { Loader, type LoaderVariant } from "@/components/motion/loader";
import {
  DURATION_FAST,
  DURATION_MEDIUM,
  DURATION_QUICK,
  EASE_BOUNCE,
  EASE_OUT,
  EASE_SMOOTH_OUT,
  SPRING_LAYOUT,
} from "@/lib/ease";
import { GRID_MAX_RENDER, useXmd } from "@/core/engine";
import { avatarColor } from "@/core/utils";
import { cn } from "@/lib/utils";
import { useCardTilt } from "@/components/motion/card-tilt";
import { flyToOrb } from "./flyToOrb";
import { usePortalRoot } from "./context";
import { useHoverPreview } from "./useHoverPreview";
import type { MediaItem, MediaViewKind } from "@/core/types";

interface ThumbPreviewContextType {
  onThumbEnter: (item: MediaItem, event: React.PointerEvent<HTMLElement>) => void;
  onThumbLeave: (event: React.PointerEvent<HTMLElement>) => void;
}
const ThumbPreviewContext = createContext<ThumbPreviewContextType | null>(null);
// 切换视图时让共享媒体直接接力，避免父卡片重新淡入/缩放遮住位移。
const MediaViewTransitionContext = createContext(false);

const isDownloaded = (item: MediaItem) => item.status === "done" || !!item.savedBefore;

function DownloadedBadge({ className }: { className?: string }) {
  return <span data-xmd-saved="true" className={cn("whitespace-nowrap rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-medium leading-3 text-white", className)}>已下载</span>;
}

export const mediaViewOptions: { id: MediaViewKind; label: string; icon: typeof GridIcon }[] = [
  { id: "list", label: "List", icon: ListIcon },
  { id: "card", label: "Card", icon: GridIcon },
  { id: "tweet", label: "Tweet", icon: ImagesIcon },
  { id: "pack", label: "Pack", icon: Layers },
];

/** 媒体视图切换胶囊（List/Card/Pack）+ 博主数指示，放在面板工具条，始终可见 */
export function MediaViewSwitcher() {
  const items = useXmd(s => s.items);
  const filter = useXmd(s => s.filter);
  const mediaView = useXmd(s => s.mediaView);
  const setMediaView = useXmd(s => s.setMediaView);

  const filtered = filter === "all" ? items : items.filter(m => m.type === filter);
  const authorCount = new Set(filtered.map(m => m.username || "页面媒体")).size;

  return (
    <div className="flex items-center justify-between px-0.5">
      <div className="flex items-center gap-1 rounded-lg border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-850/80 p-0.5">
        {mediaViewOptions.map(opt => {
          const isActive = mediaView === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMediaView(opt.id)}
              title={`${opt.label} 视图`}
              aria-label={`${opt.label} 视图`}
              className={cn(
                "relative flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer select-none",
                isActive
                  ? "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300",
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="xmd_media_view_pill"
                  transition={{ type: "spring", stiffness: 480, damping: 32 }}
                  className="absolute inset-0 rounded-md bg-white dark:bg-zinc-700 shadow-sm border border-black/[0.04] dark:border-white/[0.06]"
                />
              )}
              <Icon className="relative z-10 h-3 w-3" />
              <span className="relative z-10">{opt.label}</span>
              {opt.id === "pack" && authorCount > 1 && (
                <span className="relative z-10 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 px-1 text-[9px] font-bold">
                  {authorCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {items.length > 0 && (
        <div className="flex items-center gap-1 text-[10.5px] text-zinc-400 dark:text-zinc-500">
          <Users className="h-3 w-3" />
          <span>{authorCount} 位博主 · 共 {filtered.length} 项</span>
        </div>
      )}
    </div>
  );
}

export function Grid() {
  const items = useXmd(s => s.items);
  const filter = useXmd(s => s.filter);
  const mediaView = useXmd(s => s.mediaView);
  const setMediaView = useXmd(s => s.setMediaView);
  const focusedAuthor = useXmd(s => s.focusedAuthor);
  const setFocusedAuthor = useXmd(s => s.setFocusedAuthor);
  const isScanning = useXmd(s => s.isScanning);
  const isAutoScrolling = useXmd(s => s.isAutoScrolling);
  const isApiFetching = useXmd(s => s.isApiFetching);
  const gridRef = useRef<HTMLDivElement>(null);

  const portalRoot = usePortalRoot();
  const layoutGroupId = useId();
  const reducedMotion = useReducedMotion();
  const viewKey = `${filter}:${mediaView}:${focusedAuthor ?? "all"}`;
  const previousView = useRef(viewKey);
  const switchingView = previousView.current !== viewKey;
  useLayoutEffect(() => { previousView.current = viewKey; }, [viewKey]);
  const preview = useHoverPreview<MediaItem>();
  const previewItem = preview.item;
  useEffect(() => { preview.close(); }, [viewKey, items.length === 0, preview.close]);

  // 采集期间新条目不断追加，网格自动滚到底部
  useEffect(() => {
    if ((isAutoScrolling || isApiFetching) && gridRef.current) {
      gridRef.current.scrollTop = gridRef.current.scrollHeight;
    }
  }, [items.length, isAutoScrolling, isApiFetching]);

  // 过滤后的媒体
  const filtered = useMemo(() => {
    return filter === "all" ? items : items.filter(m => m.type === filter);
  }, [items, filter]);

  // 按博主聚合分组
  const authorGroups = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const it of filtered) {
      const key = it.username ? `@${it.username}` : "页面媒体";
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return [...map.entries()].map(([author, list]) => ({
      author,
      rawUsername: list[0]?.username || "",
      avatar: list.find(it => it.avatar)?.avatar,
      items: list,
      selectedCount: list.filter(it => it.selected).length,
      imageCount: list.filter(it => it.type === "image").length,
      videoCount: list.filter(it => it.type === "video").length,
    }));
  }, [filtered]);

  // 按单条推文 (tweetId) 聚合分组多图卡片
  const tweetGroups = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const it of filtered) {
      const key = it.tweetId ? `tweet_${it.tweetId}` : `solo_${it.id}`;
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return [...map.entries()].map(([key, list]) => {
      const first = list[0];
      const author = first.username ? `@${first.username}` : "推文媒体";
      return {
        key,
        tweetId: first.tweetId,
        author,
        rawUsername: first.username || "",
        avatar: list.find(it => it.avatar)?.avatar,
        tweetTime: first.tweetTime,
        items: list,
        selectedCount: list.filter(it => it.selected).length,
        allSelected: list.some(it => !isDownloaded(it)) && list.filter(it => !isDownloaded(it)).every(it => it.selected),
      };
    });
  }, [filtered]);

  if (!items.length) {
    const busy: { text: string; variant: LoaderVariant } | null = isScanning
      ? { text: "扫描中…", variant: "dots" }
      : isAutoScrolling
        ? { text: "自动加载中…", variant: "bars" }
        : isApiFetching
          ? { text: "API 抓取中…", variant: "comet" }
          : null;
    return (
      <div className="xm-empty">
        {busy ? (
          <>
            <Loader variant={busy.variant} size={24} label={busy.text} />
            <span className="font-medium text-zinc-600 dark:text-zinc-300">{busy.text}</span>
          </>
        ) : (
          <>
            <svg
              className="hi text-zinc-300 dark:text-zinc-600"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.13"
              aria-hidden="true"
            >
              <path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
            <span>选择模式开始检测媒体</span>
          </>
        )}
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={layoutGroupId}>
        <motion.div
          layoutScroll
          ref={gridRef}
          className="relative xmd-scroll-hidden max-h-[250px] min-h-[160px] overflow-y-auto overflow-x-hidden p-2"
        >
          <MediaViewTransitionContext.Provider value={switchingView || !!reducedMotion}>
            <ThumbPreviewContext.Provider value={{ onThumbEnter: preview.enter, onThumbLeave: preview.leave }}>
              <AnimatePresence
                initial={false}
                mode="popLayout"
                root={portalRoot instanceof ShadowRoot ? portalRoot : undefined}
              >
                <motion.div
                  key={viewKey}
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, pointerEvents: "none" }}
                  transition={{ duration: reducedMotion ? 0 : DURATION_QUICK }}
                >
                  {filtered.length === 0 ? (
                    <div className="xm-empty">
                      <svg
                        className="hi text-zinc-300 dark:text-zinc-600"
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.13"
                        aria-hidden="true"
                      >
                        <path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                      </svg>
                      <span>没有该类型的媒体</span>
                    </div>
                  ) : mediaView === "list" ? (
                    <ListView items={filtered} />
                  ) : mediaView === "card" ? (
                    <CardView items={filtered} />
                  ) : mediaView === "tweet" ? (
                    <TweetBundleView groups={tweetGroups} />
                  ) : (
                    <PackView
                      groups={authorGroups}
                      focusedAuthor={focusedAuthor}
                      onSelectAuthor={setFocusedAuthor}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </ThumbPreviewContext.Provider>
          </MediaViewTransitionContext.Provider>
        </motion.div>

        {/* 缩略图悬停放大 · 同元素位移动画 (Shared-Element Morph Preview) */}
        {createPortal(
          <AnimatePresence>
            {previewItem && (
              <motion.div
                key="grid-preview-backdrop"
                className="xhd-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: DURATION_FAST, ease: EASE_SMOOTH_OUT } }}
                exit={{ opacity: 0, transition: { duration: DURATION_QUICK, ease: EASE_SMOOTH_OUT } }}
                onClick={preview.dismiss}
                onPointerMove={preview.trackPointer}
                onPointerLeave={preview.close}
              >
                <motion.div
                  layoutId={`xmd-th-${previewItem.id}`}
                  ref={preview.previewRef}
                  transition={SPRING_LAYOUT}
                  className="xhd-preview select-none"
                  onClick={e => e.stopPropagation()}
                  onPointerEnter={preview.cancelClose}
                  onPointerLeave={preview.trackPointer}
                >
                  {previewItem.type === "image" ? (
                    <img
                      src={previewItem.url || previewItem.thumbnail}
                      alt=""
                      className="w-full max-h-[58vh] object-contain bg-black/40"
                    />
                  ) : (
                    <div className="xhd-preview-ph">
                      <Film className="h-8 w-8 text-[var(--stage-muted)]" />
                    </div>
                  )}
                  <div className="xhd-preview-name flex items-center justify-between gap-2 px-3 py-2">
                    <span className="truncate text-xs font-medium text-[var(--stage-fg)]">
                      {previewItem.username ? `@${previewItem.username} · ` : ""}{previewItem.fileName || "媒体预览"}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 tracking-wide",
                        previewItem.type === "video"
                          ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
                          : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
                      )}
                    >
                      {previewItem.type === "video" ? "HD · MP4" : "4K · 超清原图"}
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          portalRoot ?? document.body,
        )}
      </LayoutGroup>
    </MotionConfig>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. List 视图 (列表模式)
// ─────────────────────────────────────────────────────────────────────────────

function ListView({ items }: { items: MediaItem[] }) {
  const shown = items.slice(-GRID_MAX_RENDER);

  return (
    <div className="flex flex-col gap-1.5">
      {shown.map((item, index) => (
        <ListRow key={item.id} item={item} index={index} />
      ))}
      {items.length > GRID_MAX_RENDER && (
        <div className="py-1 text-center text-[10.5px] text-zinc-400">
          仅显示最近 {GRID_MAX_RENDER} 个（共 {items.length} 个）
        </div>
      )}
    </div>
  );
}

const ListRow = memo(function ListRow({ item, index }: { item: MediaItem; index: number }) {
  const switchingView = useContext(MediaViewTransitionContext);
  const toggleItem = useXmd(s => s.toggleItem);
  const downloadSingle = useXmd(s => s.downloadSingle);
  const previewCtx = useContext(ThumbPreviewContext);
  const [loaded, setLoaded] = useState(false);

  return (
    <motion.div
      initial={switchingView ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: EASE_OUT, delay: Math.min(index * 0.015, 0.3) }}
      onClick={() => toggleItem(item.id)}
      className={cn(
        "group flex cursor-pointer items-center justify-between gap-2.5 rounded-xl p-2 transition-colors duration-150 ease-out select-none",
        item.selected
          ? "bg-[var(--soft)] text-[var(--soft-ink)] shadow-[0_0_0_1px_rgba(0,115,229,0.22)]"
          : "bg-[var(--stage-surface)] hover:bg-[var(--chip)] shadow-[0_0_0_1px_var(--stage-border)]",
        item.status === "error" && "shadow-[0_0_0_1px_var(--err)]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {/* 左侧缩略图（支持同元素悬停放大） */}
        <motion.div
          layoutId={`xmd-th-${item.id}`}
          transition={SPRING_LAYOUT}
          onPointerEnter={e => {
            e.stopPropagation();
            previewCtx?.onThumbEnter(item, e);
          }}
          onPointerLeave={e => {
            e.stopPropagation();
            previewCtx?.onThumbLeave(e);
          }}
          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--chip)] shadow-[0_0_0_1px_var(--stage-border)] cursor-zoom-in"
        >
          {item.thumbnail ? (
            <>
              {!loaded && <span className="xmd-skel" />}
              <img
                src={item.thumbnail}
                alt=""
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onError={e => {
                  e.currentTarget.style.visibility = "hidden";
                }}
                className={cn(
                  "h-full w-full object-cover transition-opacity duration-200",
                  loaded ? "opacity-100" : "opacity-0",
                  item.status === "done" && "opacity-60",
                )}
              />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--stage-muted)]">
              {item.type === "video" ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
            </div>
          )}
          {item.type === "video" && (
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[8px] font-bold text-white">
              VID
            </span>
          )}
        </motion.div>

        {/* 中间信息 */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            {item.username && (
              <span className="truncate text-[11px] font-medium text-[var(--stage-fg)]">
                @{item.username}
              </span>
            )}
            <span
              className={cn(
                "rounded px-1.5 py-0.2 text-[9px] font-medium",
                item.type === "video"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-[var(--soft)] text-[var(--soft-ink)]",
              )}
            >
              {item.type === "video" ? "视频" : "图片"}
            </span>
          </div>
          <span className="truncate text-[10px] text-[var(--stage-muted)]">
            {item.fileName || "媒体文件"}
          </span>
        </div>
      </div>

      {/* 右侧动作与勾选 */}
      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        <button
          title="单张下载"
          aria-label={isDownloaded(item) ? "已下载" : "单张下载"}
          disabled={isDownloaded(item) || item.status === "loading"}
          onClick={() => {
            void downloadSingle({
              url: item.url,
              type: item.type,
              thumbnail: item.thumbnail,
              username: item.username,
              tweetId: item.tweetId,
              tweetTime: item.tweetTime,
              avatar: item.avatar,
            });
          }}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[var(--stage-muted)] hover:bg-[var(--chip)] hover:text-[var(--stage-fg)] transition-colors"
        >
          <Download className="h-3 w-3" />
        </button>

        {item.username && item.tweetId && (
          <button
            title="打开推文"
            onClick={() => {
              window.open(`https://x.com/${item.username}/status/${item.tweetId}`, "_blank", "noopener");
            }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[var(--stage-muted)] hover:bg-[var(--chip)] hover:text-[var(--stage-fg)] transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        )}

        {/* 已保存项以状态替代勾选框。 */}
        {isDownloaded(item) ? <DownloadedBadge /> : <button
          type="button"
          aria-label="选择媒体"
          onClick={() => toggleItem(item.id)}
          className={cn(
            "flex h-5 w-5 cursor-pointer items-center justify-center rounded-md transition-colors",
            item.selected
              ? "bg-[var(--stage-accent)] text-[var(--stage-on-accent)] shadow-xs"
              : "border border-[var(--stage-border)] bg-[var(--stage-surface)] hover:border-zinc-400",
          )}
        >
          <AnimatePresence>
            {item.selected && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1, transition: { duration: 0.18, ease: EASE_BOUNCE } }}
                exit={{ scale: 0, transition: { duration: 0.1, ease: EASE_SMOOTH_OUT } }}
                className="flex items-center justify-center"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>}
      </div>
    </motion.div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Card 视图 (平铺网格模式)
// ─────────────────────────────────────────────────────────────────────────────

function CardView({ items }: { items: MediaItem[] }) {
  const shown = items.slice(-GRID_MAX_RENDER);

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {shown.map((it, i) => (
        <Card key={it.id} item={it} index={i} />
      ))}
      {items.length > GRID_MAX_RENDER && (
        <div className="col-span-5 py-1 text-center text-[10.5px] text-zinc-400">
          仅显示最近 {GRID_MAX_RENDER} 个（共 {items.length} 个）
        </div>
      )}
    </div>
  );
}

const Card = memo(function Card({ item, index }: { item: MediaItem; index: number }) {
  const switchingView = useContext(MediaViewTransitionContext);
  const toggleItem = useXmd(s => s.toggleItem);
  const downloadSingle = useXmd(s => s.downloadSingle);
  const toast = useXmd(s => s.toast);
  const previewCtx = useContext(ThumbPreviewContext);
  const [loaded, setLoaded] = useState(false);
  const { ref: tiltRef, onPointerMove, onPointerLeave } = useCardTilt({ maxTilt: 3.5 });

  // 只在共享缩略图自身裁切圆角，外层裁切会截断跨视图飞行的媒体。
  return (
    <motion.div
      ref={tiltRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      initial={switchingView ? false : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: EASE_OUT, delay: Math.min(index * 0.015, 0.4) }}
      whileTap={{ scale: 0.94 }}
      onClick={() => toggleItem(item.id)}
      onContextMenu={e => {
        e.preventDefault();
        void navigator.clipboard?.writeText(item.url).then(() => toast("已复制媒体链接", "success"));
      }}
      title={item.fileName}
      className={cn(
        "t-tilt relative aspect-square cursor-pointer rounded-xl transition-[box-shadow,opacity] duration-150 ease-out select-none",
        item.selected
          ? "shadow-[0_0_0_2px_var(--stage-surface),0_0_0_4px_var(--stage-accent)]"
          : "shadow-[0_0_0_1px_var(--stage-border)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.14)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.18)]",
        item.status === "error" && "shadow-[0_0_0_1px_var(--err)]",
        item.status === "loading" && "animate-pulse",
      )}
    >
      <div className="t-tilt-card h-full w-full">
        {/* 视差随动高光光斑 */}
        <span className="t-tilt-glare" />
        {item.thumbnail ? (
          <motion.div
            layoutId={`xmd-th-${item.id}`}
            transition={SPRING_LAYOUT}
            onPointerEnter={e => previewCtx?.onThumbEnter(item, e)}
            onPointerLeave={e => previewCtx?.onThumbLeave(e)}
            className="h-full w-full overflow-hidden rounded-xl cursor-zoom-in"
          >
            {!loaded && <span className="xmd-skel" />}
            <img
              src={item.thumbnail}
              loading="lazy"
              alt=""
              draggable={false}
              onLoad={() => setLoaded(true)}
              onError={e => {
                e.currentTarget.style.visibility = "hidden";
              }}
              className={cn(
                "h-full w-full object-cover transition-opacity duration-200",
                loaded ? "opacity-100" : "opacity-0",
                item.status === "done" && "opacity-50",
              )}
            />
          </motion.div>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[var(--stage-muted)]">
            {item.type === "video" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          </span>
        )}

        {/* hover 迷你动作 */}
        <span className="xmd-card-acts">
          <button
            title="单张下载"
            aria-label={isDownloaded(item) ? "已下载" : "单张下载"}
            disabled={isDownloaded(item) || item.status === "loading"}
            onClick={e => {
              e.stopPropagation();
              flyToOrb({
                startRect: (e.currentTarget as HTMLElement).getBoundingClientRect(),
                thumbnail: item.thumbnail,
              });
              void downloadSingle({
                url: item.url,
                type: item.type,
                thumbnail: item.thumbnail,
                username: item.username,
                tweetId: item.tweetId,
                tweetTime: item.tweetTime,
                avatar: item.avatar,
              });
            }}
          >
            <Download className="h-2.5 w-2.5" />
          </button>
          {item.username && item.tweetId && (
            <button
              title="打开推文"
              onClick={e => {
                e.stopPropagation();
                window.open(`https://x.com/${item.username}/status/${item.tweetId}`, "_blank", "noopener");
              }}
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          )}
        </span>

        {/* 选中角标：弹性 pop-in */}
        <AnimatePresence>
          {item.selected && !isDownloaded(item) && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                transition: { duration: 0.22, ease: EASE_BOUNCE },
              }}
              exit={{
                scale: 0.4,
                opacity: 0,
                transition: { duration: 0.12, ease: EASE_SMOOTH_OUT },
              }}
              className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--stage-accent)] text-[var(--stage-on-accent)] shadow-sm"
            >
              <Check className="h-2.5 w-2.5" strokeWidth={4} />
            </motion.span>
          )}
        </AnimatePresence>

        {/* 类型与画质发光微标 */}
        <span className={cn("absolute right-1 flex items-center gap-0.5 rounded bg-black/60 backdrop-blur-xs px-1 py-0.2 text-[8px] font-mono font-bold text-white shadow-xs", isDownloaded(item) ? "top-1" : "bottom-1")}>
          {item.type === "video" ? (
            <>
              <Film className="h-2.5 w-2.5 text-violet-300" />
              <span>MP4</span>
            </>
          ) : (
            <span>4K</span>
          )}
        </span>

        {/* 已下载 / 失败状态 */}
        {isDownloaded(item) && <DownloadedBadge className="absolute bottom-1 inset-x-1 text-center px-0" />}
        {item.status === "error" && (
          <span
            title={item.error || "下载失败"}
            className="absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white"
          >
            !
          </span>
        )}
      </div>
    </motion.div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tweet 视图 (单推文多图聚合卡片)
// ─────────────────────────────────────────────────────────────────────────────

interface TweetGroup {
  key: string;
  tweetId?: string;
  author: string;
  rawUsername: string;
  avatar?: string;
  tweetTime: Date | null;
  items: MediaItem[];
  selectedCount: number;
  allSelected: boolean;
}

function TweetBundleView({ groups }: { groups: TweetGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-[var(--stage-muted)]">
        没有找到推文媒体
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-1">
      {groups.map((group, index) => (
        <TweetBundleCard key={group.key} group={group} index={index} />
      ))}
    </div>
  );
}

function TweetBundleCard({ group, index }: { group: TweetGroup; index: number }) {
  const switchingView = useContext(MediaViewTransitionContext);
  const selectTweetItems = useXmd(s => s.selectTweetItems);
  const toggleItem = useXmd(s => s.toggleItem);
  const downloadSingle = useXmd(s => s.downloadSingle);
  const isDownloading = useXmd(s => s.isDownloading);

  const isAll = group.allSelected;
  const isPartial = group.selectedCount > 0 && !isAll;

  const handleToggleAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectTweetItems(group.tweetId || group.key, !isAll);
  };

  const handleDownloadBundle = (e: React.MouseEvent) => {
    e.stopPropagation();
    for (const item of group.items) {
      if (item.status !== "loading" && !isDownloaded(item)) {
        void downloadSingle({
          url: item.url,
          type: item.type,
          thumbnail: item.thumbnail,
          username: item.username,
          tweetId: item.tweetId,
          tweetTime: item.tweetTime,
          avatar: item.avatar,
        });
      }
    }
  };

  const timeLabel = useMemo(() => {
    if (!group.tweetTime) return "";
    const d = new Date(group.tweetTime);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${m}/${day} ${h}:${min}`;
  }, [group.tweetTime]);

  const tweetUrl = group.tweetId
    ? `https://x.com/${group.rawUsername || "i"}/status/${group.tweetId}`
    : null;

  return (
    <motion.div
      initial={switchingView ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.025, 0.25), ease: EASE_SMOOTH_OUT }}
      className="group relative flex flex-col rounded-2xl bg-[var(--stage-surface)] p-2.5 shadow-[0_0_0_1px_var(--stage-border),0_2px_8px_rgba(0,0,0,0.04)] transition-shadow duration-200 ease-out hover:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.08)]"
    >
      {/* 头部元信息栏 */}
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div
            className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-medium text-white shadow-xs"
            style={group.avatar ? undefined : { background: avatarColor(group.author) }}
          >
            {group.avatar ? (
              <img src={group.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              group.author.charAt(1) || group.author.charAt(0)
            )}
          </div>
          <span className="truncate text-xs font-medium text-[var(--stage-fg)]">
            {group.author}
          </span>
          {timeLabel && (
            <span className="text-[10.5px] text-[var(--stage-muted)] tabular-nums shrink-0">
              · {timeLabel}
            </span>
          )}
        </div>

        {/* 顶部动作组 */}
        <div className="flex items-center gap-1 shrink-0">
          {tweetUrl && (
            <a
              href={tweetUrl}
              target="_blank"
              rel="noreferrer"
              title="在 X 打开此推文"
              className="ib h-6 w-6 text-[var(--stage-muted)] hover:text-[var(--stage-fg)]"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
            </a>
          )}
          <button
            type="button"
            title="一键下载此推文的所有媒体"
            className="ib h-6 w-6 text-[var(--stage-muted)] hover:text-[var(--stage-fg)]"
            onClick={e => {
              flyToOrb({
                startRect: (e.currentTarget as HTMLElement).getBoundingClientRect(),
                thumbnail: group.items[0]?.thumbnail,
              });
              handleDownloadBundle(e);
            }}
            disabled={isDownloading || group.items.every(isDownloaded)}
          >
            <Download className="h-3 w-3" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={handleToggleAll}
            title={group.items.every(isDownloaded) ? "已下载" : isAll ? "取消全选此推文" : "全选此推文"}
            disabled={group.items.every(isDownloaded)}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all cursor-pointer select-none active:scale-95 duration-150",
              isAll
                ? "bg-[var(--stage-accent)] text-[var(--stage-on-accent)]"
                : isPartial
                  ? "bg-[var(--soft)] text-[var(--soft-ink)] ring-1 ring-[var(--soft-ink)]"
                  : "bg-[var(--chip)] text-[var(--stage-muted)] hover:text-[var(--stage-fg)]",
            )}
          >
            {!group.items.every(isDownloaded) && <CheckSquare className="h-3 w-3" strokeWidth={1.5} />}
            <span className="tabular-nums">
              {group.items.every(isDownloaded) ? "已下载" : group.selectedCount > 0 ? `${group.selectedCount}/${group.items.length}` : `${group.items.length}P`}
            </span>
          </button>
        </div>
      </div>

      {/* 推文拼图布局 */}
      <TweetMosaic items={group.items} onToggle={toggleItem} />
    </motion.div>
  );
}

function TweetMosaic({ items, onToggle }: { items: MediaItem[]; onToggle: (id: string) => void }) {
  const n = items.length;

  if (n === 1) {
    return (
      <div className="relative h-44 w-full rounded-xl">
        <MosaicCell item={items[0]} onToggle={onToggle} />
      </div>
    );
  }

  if (n === 2) {
    return (
      <div className="grid grid-cols-2 gap-1.5 h-36 w-full rounded-xl">
        <MosaicCell item={items[0]} onToggle={onToggle} />
        <MosaicCell item={items[1]} onToggle={onToggle} />
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className="grid grid-cols-2 gap-1.5 h-44 w-full rounded-xl">
        <div className="row-span-2 h-full rounded-lg">
          <MosaicCell item={items[0]} onToggle={onToggle} />
        </div>
        <div className="h-[calc(50%-3px)] rounded-lg">
          <MosaicCell item={items[1]} onToggle={onToggle} />
        </div>
        <div className="h-[calc(50%-3px)] rounded-lg">
          <MosaicCell item={items[2]} onToggle={onToggle} />
        </div>
      </div>
    );
  }

  // 4 项及以上：2x2 宫格，超出 4 项在第 4 格显示 +N 遮罩
  const first3 = items.slice(0, 3);
  const fourth = items[3];
  const moreCount = n > 4 ? n - 3 : 0;

  return (
    <div className="grid grid-cols-2 gap-1.5 h-44 w-full rounded-xl">
      {first3.map(item => (
        <div key={item.id} className="h-full rounded-lg">
          <MosaicCell item={item} onToggle={onToggle} />
        </div>
      ))}
      <div className="relative h-full rounded-lg">
        <MosaicCell item={fourth} onToggle={onToggle} />
        {moreCount > 0 && (
          <div
            onClick={e => {
              e.stopPropagation();
              onToggle(fourth.id);
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xs font-bold text-white text-base select-none cursor-pointer transition-opacity hover:bg-black/50"
          >
            +{moreCount}
          </div>
        )}
      </div>
    </div>
  );
}

function MosaicCell({ item, onToggle }: { item: MediaItem; onToggle: (id: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const previewCtx = useContext(ThumbPreviewContext);
  const { ref: tiltRef, onPointerMove, onPointerLeave } = useCardTilt({ maxTilt: 2.8 });

  return (
    <div
      ref={tiltRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={() => onToggle(item.id)}
      className="t-tilt group/cell relative h-full w-full rounded-lg cursor-pointer select-none bg-[var(--stage-border)]"
    >
      <div className="t-tilt-card h-full w-full">
        {/* 视差随动高光光斑 */}
        <span className="t-tilt-glare" />
        {!loaded && <span className="xmd-skel absolute inset-0" />}
        {item.thumbnail ? (
          <motion.div
            layoutId={`xmd-th-${item.id}`}
            transition={SPRING_LAYOUT}
            onPointerEnter={e => previewCtx?.onThumbEnter(item, e)}
            onPointerLeave={e => previewCtx?.onThumbLeave(e)}
            className="h-full w-full overflow-hidden rounded-lg cursor-zoom-in"
          >
            <img
              src={item.thumbnail}
              alt=""
              loading="lazy"
              onLoad={() => setLoaded(true)}
              className={cn(
                "h-full w-full object-cover transition-transform duration-200 ease-out will-change-transform group-hover/cell:scale-105",
                loaded ? "opacity-100" : "opacity-0",
                item.status === "done" && "opacity-60",
              )}
            />
          </motion.div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--stage-muted)]">
            {item.type === "video" ? <Film className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
          </div>
        )}

        {/* 选中框 / 角标 */}
        <div
          className={cn(
            "absolute inset-0 pointer-events-none transition-colors duration-150 ease-out",
            item.selected
              ? "ring-2 ring-inset ring-[var(--stage-accent)] bg-black/10"
              : "group-hover/cell:bg-black/5",
          )}
        />

        {/* 右上角选中勾选圆标 */}
        {!isDownloaded(item) && <span
          className={cn(
            "absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full transition-transform active:scale-90 shadow-sm",
            item.selected
              ? "bg-[var(--stage-accent)] text-[var(--stage-on-accent)] scale-100 xmd-check-pop"
              : "bg-black/50 text-white opacity-0 group-hover/cell:opacity-100 scale-90",
          )}
        >
          <Check className="h-3 w-3" strokeWidth={2.5} />
        </span>}

        {/* 左下角画质与媒体类型标 */}
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/65 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-mono font-bold text-white shadow-xs">
          {item.type === "video" ? (
            <>
              <Film className="h-2.5 w-2.5 text-violet-300" />
              <span>MP4</span>
            </>
          ) : (
            <span>4K 原图</span>
          )}
        </span>

        {/* 右下角下载成功指示 */}
        {isDownloaded(item) && <DownloadedBadge className="absolute bottom-1.5 right-1.5" />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Pack 视图 (博主重叠包 / 堆叠卡片模式)
// ─────────────────────────────────────────────────────────────────────────────

interface AuthorGroup {
  author: string;
  rawUsername: string;
  avatar?: string;
  items: MediaItem[];
  selectedCount: number;
  imageCount: number;
  videoCount: number;
}

function PackView({
  groups,
  focusedAuthor,
  onSelectAuthor,
}: {
  groups: AuthorGroup[];
  focusedAuthor: string | null;
  onSelectAuthor: (author: string | null) => void;
}) {
  const selectAuthorItems = useXmd(s => s.selectAuthorItems);

  // 如果处于单独博主下钻页面
  if (focusedAuthor) {
    const group = groups.find(g => g.author === focusedAuthor) || groups[0];
    if (!group) {
      return (
        <div className="py-6 text-center text-xs text-zinc-400">
          未找到该博主媒体
          <button
            onClick={() => onSelectAuthor(null)}
            className="mt-2 block mx-auto text-violet-600 underline text-[11px]"
          >
            返回所有博主
          </button>
        </div>
      );
    }

    const available = group.items.filter(it => !isDownloaded(it));
    const allSelected = available.length > 0 && available.every(it => it.selected);

    return (
      <div className="flex flex-col gap-2">
        {/* 博主下钻专属顶栏 */}
        <div className="flex items-center justify-between rounded-lg border border-zinc-200/80 dark:border-zinc-800/80 bg-gradient-to-r from-violet-500/10 via-zinc-50 dark:via-zinc-850 to-transparent p-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => onSelectAuthor(null)}
              title="返回所有博主合集"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>

            {/* 头像 */}
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white shadow-sm"
              style={group.avatar ? undefined : { background: avatarColor(group.author) }}
            >
              {group.avatar ? (
                <img src={group.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                group.author.charAt(1) || group.author.charAt(0)
              )}
            </div>

            <div className="flex flex-col min-w-0">
              <span className="truncate text-xs font-bold text-zinc-800 dark:text-zinc-100">
                {group.author}
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                共 {group.items.length} 个媒体 · 已选 {group.selectedCount}
              </span>
            </div>
          </div>

          {/* 全选该博主动作 */}
          <button
            onClick={() => selectAuthorItems(group.rawUsername || group.author, !allSelected)}
            disabled={!available.length}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors cursor-pointer",
              allSelected
                ? "bg-violet-600 text-white"
                : "border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50",
            )}
          >
            {available.length > 0 && <CheckSquare className="h-3 w-3" />}
            <span>{!available.length ? "已下载" : allSelected ? "取消全选" : "全选博主"}</span>
          </button>
        </div>

        {/* 该博主下的平铺媒体卡片 */}
        <div className="grid grid-cols-5 gap-1.5 pt-1">
          {group.items.map((it, i) => (
            <Card key={it.id} item={it} index={i} />
          ))}
        </div>
      </div>
    );
  }

  // 默认：展示全部博主卡包重叠网格 (Pack Grid)
  return (
    <div className="grid grid-cols-2 gap-3 py-1">
      {groups.map((group, index) => (
        <AuthorPackCard
          key={group.author}
          group={group}
          index={index}
          onClick={() => onSelectAuthor(group.author)}
        />
      ))}
    </div>
  );
}

/** 单个博主重叠堆叠卡包 (Overlapping Collectible Pack with Enhanced Fan-Out Micro-Interactions) */
function AuthorPackCard({
  group,
  index,
  onClick,
}: {
  group: AuthorGroup;
  index: number;
  onClick: () => void;
}) {
  const switchingView = useContext(MediaViewTransitionContext);
  const [isHovered, setIsHovered] = useState(false);
  const thumbs = group.items.slice(0, 3);

  return (
    <motion.div
      initial={switchingView ? false : { opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE_OUT, delay: Math.min(index * 0.03, 0.3) }}
      whileHover={{ y: -3, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center justify-between rounded-2xl p-3 cursor-pointer select-none transition-colors duration-150 ease-out",
        group.selectedCount > 0
          ? "bg-[var(--soft)] shadow-[0_0_0_1.5px_rgba(0,115,229,0.25)]"
          : "bg-[var(--stage-surface)] shadow-[0_0_0_1px_var(--stage-border)] hover:bg-[var(--chip)]",
      )}
    >
      {/* 重叠卡片堆叠区域 (Overlapping Stack Container) */}
      <div className="relative h-20 w-full flex items-center justify-center my-1">
        {/* 后层卡片 1 (左倾斜) */}
        {thumbs[1] && (
          <motion.div
            layoutId={`xmd-th-${thumbs[1].id}`}
            className="absolute h-15 w-15 overflow-hidden rounded-lg border-2 border-white dark:border-zinc-800 bg-zinc-200 dark:bg-zinc-700 shadow-md pointer-events-none"
            animate={{
              rotate: isHovered ? -16 : -11,
              x: isHovered ? -12 : -8,
              y: isHovered ? -3 : 0,
            }}
            transition={{ ...SPRING_LAYOUT, layout: { duration: DURATION_MEDIUM, ease: EASE_SMOOTH_OUT } }}
            style={{ zIndex: 1 }}
          >
            <img
              src={thumbs[1].thumbnail || thumbs[1].url}
              alt=""
              className="h-full w-full object-cover opacity-85"
            />
          </motion.div>
        )}

        {/* 后层卡片 2 (右倾斜) */}
        {thumbs[2] && (
          <motion.div
            layoutId={`xmd-th-${thumbs[2].id}`}
            className="absolute h-15 w-15 overflow-hidden rounded-lg border-2 border-white dark:border-zinc-800 bg-zinc-200 dark:bg-zinc-700 shadow-md pointer-events-none"
            animate={{
              rotate: isHovered ? 14 : 9,
              x: isHovered ? 12 : 8,
              y: isHovered ? -3 : 0,
            }}
            transition={{ ...SPRING_LAYOUT, layout: { duration: DURATION_MEDIUM, ease: EASE_SMOOTH_OUT } }}
            style={{ zIndex: 2 }}
          >
            <img
              src={thumbs[2].thumbnail || thumbs[2].url}
              alt=""
              className="h-full w-full object-cover opacity-85"
            />
          </motion.div>
        )}

        {/* 前层主卡片 (0deg 居中顶层) */}
        <motion.div
          layoutId={thumbs[0] ? `xmd-th-${thumbs[0].id}` : undefined}
          className="relative h-16 w-16 overflow-hidden rounded-xl border-2 border-white dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 shadow-lg"
          animate={{
            scale: isHovered ? 1.05 : 1,
          }}
          transition={{ ...SPRING_LAYOUT, layout: { duration: DURATION_MEDIUM, ease: EASE_SMOOTH_OUT } }}
          style={{ zIndex: 10 }}
        >
          {thumbs[0] ? (
            <img
              src={thumbs[0].thumbnail || thumbs[0].url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-400">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}

          {/* 媒体数量小徽章 */}
          <span className="absolute bottom-1 right-1 rounded-full bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm shadow-xs">
            {group.items.length}P
          </span>
        </motion.div>
      </div>

      {/* 博主名与统计栏 */}
      <div className="w-full flex items-center justify-between gap-1.5 mt-2 pt-1.5 border-t border-[var(--divider)]">
        <span className="truncate text-xs font-medium text-[var(--stage-fg)]">
          {group.author}
        </span>
        <span
          data-xmd-saved={group.items.every(isDownloaded) || undefined}
          className={cn(
            "rounded-full px-2 py-0.5 text-[10.5px] font-medium tabular-nums",
            group.selectedCount > 0
              ? "bg-[var(--stage-accent)] text-[var(--stage-on-accent)]"
              : "bg-[var(--chip)] text-[var(--stage-muted)]",
          )}
        >
          {group.items.every(isDownloaded) ? "已下载" : group.selectedCount > 0
            ? `${group.selectedCount}/${group.items.length}`
            : `${group.items.length} 个`}
        </span>
      </div>
    </motion.div>
  );
}
