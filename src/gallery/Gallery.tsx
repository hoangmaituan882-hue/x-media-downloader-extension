// 画廊页：某博主的全部历史媒体，独立扩展标签页。
// 日期分组粘性标题 / 分组全选 / 键盘交互灯箱 / 密度切换 / 快速过滤 / 批量补下载 / 导出。

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Grid2X2,
  Grid3X3,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { byUser, dayLabel, getHistory, type HistoryRecord } from "@/core/history";
import { downloadItem, pickDirectory } from "@/core/downloader";
import type { MediaItem } from "@/core/types";
import { DURATION_FAST, DURATION_QUICK, EASE_BOUNCE, EASE_SMOOTH_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

const CHUNK = 80;

interface LightboxMediaProps {
  item: HistoryRecord;
  zoom: number;
  pan: { x: number; y: number };
  slideDir: 1 | -1;
  theaterMode: boolean;
  onZoomChange: (newZoom: number) => void;
  onPanChange: (newPan: { x: number; y: number }) => void;
  onResetZoom: () => void;
}

function LightboxMedia({
  item,
  zoom,
  pan,
  slideDir,
  theaterMode,
  onZoomChange,
  onPanChange,
  onResetZoom,
}: LightboxMediaProps) {
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // 滚轮无级以光标为中心缩放 (100% ~ 500%)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (item.type !== "image") return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - (rect.left + rect.width / 2);
    const mouseY = e.clientY - (rect.top + rect.height / 2);

    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const nextZoom = Math.min(Math.max(1, +(zoom * factor).toFixed(2)), 5);

    if (nextZoom <= 1.01) {
      onResetZoom();
      return;
    }

    const ratio = nextZoom / zoom;
    const nextPanX = (pan.x - mouseX) * ratio + mouseX;
    const nextPanY = (pan.y - mouseY) * ratio + mouseY;

    onZoomChange(nextZoom);
    onPanChange({ x: nextPanX, y: nextPanY });
  };

  // 双击切换 2.5x 局部聚焦 / 1:1 复位
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (item.type !== "image") return;
    if (zoom > 1.05) {
      onResetZoom();
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);
      const targetZoom = 2.5;
      onZoomChange(targetZoom);
      onPanChange({
        x: -mouseX * (targetZoom - 1),
        y: -mouseY * (targetZoom - 1),
      });
    }
  };

  // 放大态鼠标按住平移
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    onPanChange({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  return (
    <div
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        "relative flex w-full items-center justify-center bg-black overflow-hidden select-none",
        theaterMode ? "flex-1 h-full max-h-none" : "min-h-[320px] max-h-[76vh]",
        zoom > 1 ? (isDraggingRef.current ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
      )}
    >
      <AnimatePresence mode="popLayout" custom={slideDir}>
        <motion.div
          key={item.id}
          custom={slideDir}
          variants={{
            enter: (dir: number) => ({
              x: dir > 0 ? 80 : -80,
              opacity: 0,
              scale: 0.97,
            }),
            center: {
              x: 0,
              opacity: 1,
              scale: 1,
              transition: { duration: 0.22, ease: EASE_SMOOTH_OUT },
            },
            exit: (dir: number) => ({
              x: dir > 0 ? -80 : 80,
              opacity: 0,
              scale: 0.97,
              transition: { duration: 0.15, ease: EASE_SMOOTH_OUT },
            }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          className="h-full w-full flex items-center justify-center pointer-events-none"
        >
          {item.type === "image" ? (
            <img
              src={item.url.replace(/name=\w+/, "name=orig")}
              alt=""
              draggable={false}
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isDraggingRef.current ? "none" : "transform 140ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              className={cn(
                "w-auto max-w-full object-contain will-change-transform",
                theaterMode ? "max-h-[90vh]" : "max-h-[76vh]",
              )}
            />
          ) : (
            <video
              src={item.url}
              controls
              autoPlay
              className={cn(
                "w-auto max-w-full pointer-events-auto",
                theaterMode ? "max-h-[90vh]" : "max-h-[76vh]",
              )}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function Gallery({ user }: { user: string }) {
  const [all, setAll] = useState<HistoryRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(CHUNK);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<HistoryRecord | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [theaterMode, setTheaterMode] = useState(false);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  };

  useEffect(() => {
    void (async () => {
      const recs = await getHistory();
      setAll(user ? recs.filter(r => (r.user || "").toLowerCase() === user.toLowerCase()) : recs);
    })();
  }, [user]);

  // 过滤、搜索与排序
  const sorted = useMemo(() => {
    let list = all;
    if (filter !== "all") list = list.filter(r => r.type === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        r =>
          r.fileName.toLowerCase().includes(q) ||
          (r.user || "").toLowerCase().includes(q) ||
          (r.tweetId || "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => (sort === "new" ? b.ts - a.ts : a.ts - b.ts));
  }, [all, filter, query, sort]);

  // 分页展示
  const shownCount = Math.min(limit, sorted.length);
  const visible = useMemo(() => sorted.slice(0, shownCount), [sorted, shownCount]);
  const hasMore = shownCount < sorted.length;

  // 无限滚动
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setLimit(l => l + CHUNK);
        }
      },
      { rootMargin: "400px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [sorted]);

  // 按发布日分组
  const groups = useMemo(() => {
    const m = new Map<string, HistoryRecord[]>();
    for (const r of visible) {
      const k = dayLabel(r.ts);
      const arr = m.get(k) || [];
      arr.push(r);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [visible]);

  // 灯箱预览索引
  const previewIdx = useMemo(
    () => (preview ? sorted.findIndex(r => r.id === preview.id) : -1),
    [preview, sorted],
  );

  // 预加载临近图片
  useEffect(() => {
    if (previewIdx < 0) return;
    const preload = (offset: number) => {
      const target = sorted[previewIdx + offset];
      if (target && target.type === "image") {
        const img = new Image();
        img.src = target.url.replace(/name=\w+/, "name=orig");
      }
    };
    preload(1);
    preload(-1);
  }, [previewIdx, sorted]);

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const navigatePreview = (offset: number) => {
    if (previewIdx < 0) return;
    const targetIdx = previewIdx + offset;
    if (targetIdx >= 0 && targetIdx < sorted.length) {
      setSlideDir(offset > 0 ? 1 : -1);
      resetZoom();
      setPreview(sorted[targetIdx]);
    }
  };

  // 键盘快捷键导航
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 避免输入框内冲突
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!preview) {
        if (e.key === "Escape") setSelected(new Set());
        return;
      }

      if (e.key === "Escape") {
        if (zoom > 1.05) {
          resetZoom();
        } else {
          setPreview(null);
          setTheaterMode(false);
          resetZoom();
        }
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "d" || e.key.toLowerCase() === "l") {
        navigatePreview(1);
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a" || e.key.toLowerCase() === "h") {
        navigatePreview(-1);
      } else if (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "t") {
        setTheaterMode(v => !v);
      } else if (e.key === "0") {
        resetZoom();
      } else if (e.key === "+" || e.key === "=") {
        setZoom(z => Math.min(5, +(z * 1.25).toFixed(2)));
      } else if (e.key === "-") {
        setZoom(z => Math.max(1, +(z / 1.25).toFixed(2)));
      } else if (e.key.toLowerCase() === "c") {
        void navigator.clipboard?.writeText(preview.url);
        showToast("已复制媒体原链");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, previewIdx, sorted, zoom]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDayGroup = (recs: HistoryRecord[]) => {
    const ids = recs.map(r => r.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const recToItem = (r: HistoryRecord): MediaItem => ({
    id: r.id,
    type: r.type,
    url: r.url,
    thumbnail: r.thumb || "",
    fileName: r.fileName,
    status: "loading",
    source: "inline",
    selected: true,
    tweetTime: new Date(r.ts),
    username: r.user,
    tweetId: r.tweetId,
  });

  const downloadRecs = async (recs: HistoryRecord[]) => {
    if (!recs.length || busy) return;
    setBusy(true);
    let ok = 0;
    try {
      for (const r of recs) {
        const item = recToItem(r);
        const res = await downloadItem(item, dirHandle, r.user ? [r.user] : []);
        if (res.success) ok++;
      }
      showToast(`已下载 ${ok}/${recs.length} 个媒体`);
    } catch (e) {
      showToast("下载出错：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["id", "type", "user", "tweetId", "fileName", "url", "time"],
      ...sorted.map(r => [
        r.id,
        r.type,
        r.user,
        r.tweetId,
        r.fileName,
        r.url,
        new Date(r.ts).toISOString(),
      ]),
    ];
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `xmd_${user || "all"}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(u);
    showToast("已导出 CSV");
  };

  const imgCount = all.filter(r => r.type === "image").length;
  const vidCount = all.length - imgCount;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 pb-28">
      {/* 顶部粘性操作栏 */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/85">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          {/* 左侧：返回、作者与统计 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => history.back()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors"
              title="返回"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight">
                  {user ? `@${user}` : "全部历史画廊"}
                </h1>
                <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                  {all.length} 项
                </span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                图片 {imgCount} · 视频 {vidCount} · 筛选后 {sorted.length} 项
              </div>
            </div>
          </div>

          {/* 中间：搜索框 */}
          <div className="relative flex-1 max-w-xs min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索文件名、推文或博主…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="h-8 w-full rounded-full border border-slate-200 bg-slate-50/80 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200 dark:placeholder-zinc-500 transition-[border-color,box-shadow] duration-150 ease-out"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* 右侧：过滤、排序、网格密度与导出 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 类型药丸 */}
            <div className="flex rounded-full bg-slate-100 p-0.5 dark:bg-zinc-800/80 text-xs font-medium text-slate-600 dark:text-zinc-400">
              {(["all", "image", "video"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={cn(
                    "rounded-full px-2.5 py-1 transition-colors duration-150 ease-out active:scale-95",
                    filter === t
                      ? "bg-white text-violet-600 shadow-xs font-semibold dark:bg-zinc-700 dark:text-violet-300"
                      : "hover:text-slate-900 dark:hover:text-zinc-200",
                  )}
                >
                  {t === "all" ? "全部" : t === "image" ? "图片" : "视频"}
                </button>
              ))}
            </div>

            {/* 排序 */}
            <div className="flex rounded-full bg-slate-100 p-0.5 dark:bg-zinc-800/80 text-xs font-medium text-slate-600 dark:text-zinc-400">
              <button
                onClick={() => setSort("new")}
                className={cn(
                  "rounded-full px-2.5 py-1 transition-colors duration-150 ease-out active:scale-95",
                  sort === "new"
                    ? "bg-white text-slate-900 shadow-xs font-semibold dark:bg-zinc-700 dark:text-zinc-100"
                    : "hover:text-slate-900 dark:hover:text-zinc-200",
                )}
              >
                最新
              </button>
              <button
                onClick={() => setSort("old")}
                className={cn(
                  "rounded-full px-2.5 py-1 transition-colors duration-150 ease-out active:scale-95",
                  sort === "old"
                    ? "bg-white text-slate-900 shadow-xs font-semibold dark:bg-zinc-700 dark:text-zinc-100"
                    : "hover:text-slate-900 dark:hover:text-zinc-200",
                )}
              >
                最早
              </button>
            </div>

            {/* 密度切换 */}
            <div className="flex rounded-full bg-slate-100 p-0.5 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400">
              <button
                onClick={() => setDensity("comfortable")}
                className={cn(
                  "rounded-full p-1 transition-colors duration-150 ease-out active:scale-95",
                  density === "comfortable"
                    ? "bg-white text-violet-600 shadow-xs dark:bg-zinc-700 dark:text-violet-300"
                    : "hover:text-slate-900 dark:hover:text-zinc-200",
                )}
                title="舒适网格 (大图)"
              >
                <Grid2X2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDensity("compact")}
                className={cn(
                  "rounded-full p-1 transition-colors duration-150 ease-out active:scale-95",
                  density === "compact"
                    ? "bg-white text-violet-600 shadow-xs dark:bg-zinc-700 dark:text-violet-300"
                    : "hover:text-slate-900 dark:hover:text-zinc-200",
                )}
                title="紧凑网格 (密排)"
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* 导出 CSV */}
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              title="导出当前筛选结果为 CSV 表格"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              导出
            </button>
          </div>
        </div>
      </header>

      {/* 主体媒体流 */}
      <main className="mx-auto max-w-7xl px-4 pt-4">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 dark:text-zinc-600 gap-2">
            <Sparkles className="h-8 w-8 text-slate-300 dark:text-zinc-700" />
            <p className="text-sm font-medium">没有找到符合条件的媒体记录</p>
          </div>
        ) : (
          groups.map(([day, recs]) => {
            const allDaySelected = recs.every(r => selected.has(r.id));
            return (
              <section key={day} className="xmd-g-section mb-6">
                {/* 粘性分组日期头 */}
                <div className="sticky top-[57px] z-10 -mx-4 mb-2 flex items-center justify-between border-b border-slate-200/60 bg-slate-50/95 px-4 py-2 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/95">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                      {day}
                    </h2>
                    <span className="rounded-full bg-slate-200/70 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {recs.length}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleDayGroup(recs)}
                    className="text-[11px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
                  >
                    {allDaySelected ? "取消本日" : "全选本日"}
                  </button>
                </div>

                {/* 响应式网格 */}
                <div
                  className={cn(
                    "grid gap-2.5",
                    density === "comfortable"
                      ? "grid-cols-[repeat(auto-fill,minmax(160px,1fr))]"
                      : "grid-cols-[repeat(auto-fill,minmax(115px,1fr))]",
                  )}
                >
                  {recs.map(r => (
                    <GalleryTile
                      key={r.id}
                      r={r}
                      checked={selected.has(r.id)}
                      onToggle={() => toggle(r.id)}
                      onPreview={() => setPreview(r)}
                      onToast={showToast}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}

        {/* 无限滚动哨兵 + 兜底按钮 */}
        <div ref={sentinelRef} className="flex h-12 justify-center items-center mt-6">
          {hasMore && (
            <button
              onClick={() => setLimit(l => l + CHUNK)}
              className="rounded-full border border-slate-300 px-5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              加载更多（剩余 {sorted.length - shownCount} 项）
            </button>
          )}
        </div>
      </main>

      {/* 批量操作吸底浮栏 */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: DURATION_FAST, ease: EASE_SMOOTH_OUT } }}
            exit={{ y: 80, opacity: 0, transition: { duration: DURATION_QUICK, ease: EASE_SMOOTH_OUT } }}
            className="fixed bottom-5 inset-x-4 z-30 mx-auto max-w-xl rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/95"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                  {selected.size}
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">项已选</span>
                <span className="text-slate-300 dark:text-zinc-700">|</span>
                <button
                  onClick={() => setSelected(new Set(sorted.map(r => r.id)))}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  全选筛选
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  清空
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const h = await pickDirectory().catch(() => null);
                    if (h) {
                      setDirHandle(h);
                      showToast(`已选保存目录: ${h.name}`);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                  title={dirHandle ? `当前目录: ${dirHandle.name}` : "选择下载存放目录"}
                >
                  <Download className="h-3.5 w-3.5 text-violet-500" />
                  <span>{dirHandle ? dirHandle.name : "选择目录"}</span>
                </button>
                <button
                  onClick={() => void downloadRecs(all.filter(r => selected.has(r.id)))}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  {busy ? "下载中…" : `批量下载 (${selected.size})`}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 轻提示浮层 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ duration: DURATION_QUICK }}
            className="fixed top-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md dark:bg-zinc-100 dark:text-zinc-900"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 键盘交互全屏预览灯箱 */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_FAST, ease: EASE_SMOOTH_OUT }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 select-none"
            onClick={() => {
              if (zoom > 1.05) {
                resetZoom();
              } else {
                setPreview(null);
                setTheaterMode(false);
                resetZoom();
              }
            }}
          >
            {/* 左翻页悬浮按钮 */}
            {previewIdx > 0 && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  navigatePreview(-1);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:scale-105 active:scale-95 transition-[transform,background-color] duration-150 ease-out"
                title="上一张 (← 或 A)"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* 右翻页悬浮按钮 */}
            {previewIdx < sorted.length - 1 && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  navigatePreview(1);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:scale-105 active:scale-95 transition-[transform,background-color] duration-150 ease-out"
                title="下一张 (→ 或 D)"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}

            {/* 顶部居中浮动缩放 HUD 控制胶囊 */}
            <AnimatePresence>
              {zoom > 1 && (
                <motion.div
                  initial={{ opacity: 0, y: -16, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.9 }}
                  transition={{ duration: 0.15, ease: EASE_SMOOTH_OUT }}
                  className="absolute top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 text-xs text-slate-200 border border-slate-700/80 shadow-2xl"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="font-mono font-bold text-violet-400 tabular-nums">
                    {Math.round(zoom * 100)}%
                  </span>
                  <span className="h-3 w-px bg-slate-700" />
                  <button
                    type="button"
                    onClick={resetZoom}
                    className="hover:text-white flex items-center gap-1 text-[11px] font-semibold text-slate-300 transition-colors"
                    title="复位至 1:1 原画 (双击或按 0)"
                  >
                    <RotateCcw className="h-3 w-3" />
                    1:1 复位
                  </button>
                  <span className="h-3 w-px bg-slate-700" />
                  <button
                    type="button"
                    onClick={() => setZoom(z => Math.max(1, +(z / 1.25).toFixed(2)))}
                    className="p-0.5 hover:text-white transition-colors"
                    title="缩小 (-)"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(z => Math.min(5, +(z * 1.25).toFixed(2)))}
                    className="p-0.5 hover:text-white transition-colors"
                    title="放大 (+)"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 灯箱卡片容器 / 剧场模式切换 */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 8 }}
              transition={{ duration: DURATION_FAST, ease: EASE_SMOOTH_OUT }}
              className={cn(
                "relative overflow-hidden bg-slate-950 flex flex-col transition-all duration-200",
                theaterMode
                  ? "fixed inset-0 z-40 rounded-none w-screen h-screen max-w-none max-h-none border-0"
                  : "relative max-h-[90vh] max-w-5xl w-full rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl",
              )}
              onClick={e => e.stopPropagation()}
            >
              {/* 媒体内容容器 (支持滚轮光标无级缩放与拖拽) */}
              <LightboxMedia
                item={preview}
                zoom={zoom}
                pan={pan}
                slideDir={slideDir}
                theaterMode={theaterMode}
                onZoomChange={setZoom}
                onPanChange={setPan}
                onResetZoom={resetZoom}
              />

              {/* 底部控制台 */}
              <div className="flex items-center justify-between gap-3 bg-slate-900/95 px-4 py-3 text-slate-300 border-t border-slate-800">
                <div className="min-w-0 flex-1 truncate">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-slate-100">
                      {preview.fileName}
                    </span>
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.2 text-[10px] font-bold text-violet-400 uppercase">
                      {preview.type}
                    </span>
                    {zoom > 1 && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
                        {Math.round(zoom * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {previewIdx + 1} / {sorted.length} · ← / → 翻页 · 滚轮以光标缩放 · 双击放大/复位 · T 剧场全屏
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* 剧场模式切换 */}
                  <button
                    onClick={() => setTheaterMode(v => !v)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                      theaterMode
                        ? "bg-violet-600 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
                    )}
                    title={theaterMode ? "退出剧场模式 (T / F)" : "全屏剧场模式 (T / F)"}
                  >
                    {theaterMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>

                  {/* 缩放控制 */}
                  <button
                    onClick={() => setZoom(z => Math.max(1, +(z / 1.25).toFixed(2)))}
                    disabled={zoom <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30 transition-colors"
                    title="缩小 (-)"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setZoom(z => Math.min(5, +(z * 1.25).toFixed(2)))}
                    disabled={zoom >= 5}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30 transition-colors"
                    title="放大 (+)"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  {zoom > 1 && (
                    <button
                      onClick={resetZoom}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      title="复位至 1:1 (0)"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(preview.url);
                      showToast("已复制媒体原链");
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                    title="复制链接 (C)"
                  >
                    <Copy className="h-4 w-4" />
                  </button>

                  {preview.tweetUrl && (
                    <a
                      href={preview.tweetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      title="打开原推"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}

                  <button
                    onClick={() => void downloadRecs([preview])}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                    title="下载当前文件 (D)"
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载
                  </button>

                  <button
                    onClick={() => {
                      setPreview(null);
                      setTheaterMode(false);
                      resetZoom();
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                    title="关闭 (Esc)"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GalleryTile({
  r,
  checked,
  onToggle,
  onPreview,
  onToast,
}: {
  r: HistoryRecord;
  checked: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onToast: (msg: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const poster = r.type === "image" ? r.url.replace(/name=\w+/, "name=small") : r.thumb;

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.015 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: DURATION_QUICK, ease: EASE_SMOOTH_OUT }}
      className={cn(
        "group relative aspect-square cursor-pointer overflow-hidden rounded-xl border-2 bg-slate-200 dark:bg-zinc-800 select-none shadow-2xs transition-colors",
        checked
          ? "border-violet-600 ring-2 ring-violet-500/20"
          : "border-transparent hover:border-slate-300 dark:hover:border-zinc-700",
      )}
      onClick={onPreview}
      onContextMenu={e => {
        e.preventDefault();
        void navigator.clipboard?.writeText(r.url);
        onToast("已复制原图/视频链接");
      }}
    >
      {/* 骨架屏占位 */}
      {!loaded && <div className="absolute inset-0 xmd-skeleton z-0" />}

      {poster ? (
        <img
          src={poster}
          loading="lazy"
          alt=""
          onLoad={() => setLoaded(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-800 text-white">
          ▶
        </div>
      )}

      {/* 视频角标 */}
      {r.type === "video" && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-xs">
          VID
        </span>
      )}

      {/* 勾选框：弹性 pop-in */}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border transition-[transform,opacity,background-color,border-color] duration-150 ease-out",
          checked
            ? "border-violet-600 bg-violet-600 text-white opacity-100 shadow-sm"
            : "border-slate-400 bg-white/85 text-transparent opacity-0 group-hover:opacity-100 hover:scale-110",
        )}
      >
        <AnimatePresence>
          {checked && (
            <motion.span
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.2, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_BOUNCE }}
            >
              <Check className="h-3 w-3" strokeWidth={3.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </motion.div>
  );
}
