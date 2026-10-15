import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  Cloud,
  Download,
  FolderOpen,
  History,
  Images as ImagesIcon,
  Info,
  Layers,
  List as ListIcon,
  Grid as GridIcon,
  RotateCcw,
  Search,
  Settings,
  Square,
  User,
  Waves,
  X,
} from "lucide-react";
import { SettingsView } from "./SettingsView";
import { HistoryView } from "./HistoryView";
import { AboutView } from "./AboutView";
import { DownloadAnim } from "./anim";
import { Grid } from "./Grid";
import { XLogo } from "./icons";
import { XmdTooltip } from "./Tooltip";
import { SwapText } from "@/components/motion/swap-text";
import { Digits } from "@/components/motion/digits";
import { SlidingTabs } from "@/components/motion/sliding-tabs";
import { DURATION_FAST, DURATION_QUICK, EASE_SMOOTH_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";
import type { FilterKind, MediaViewKind } from "@/core/types";
import { useXmd } from "@/core/engine";
import { getPageContext } from "@/core/page";

// 分步展开入场编排
const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.02,
    },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(2px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 420,
      damping: 28,
    },
  },
};

export function PanelBody({
  dragHandleProps,
}: {
  dragHandleProps: { onPointerDown: (e: React.PointerEvent) => void };
}) {
  const s = useXmd();
  const running = s.isAutoScrolling || s.isApiFetching || s.isDownloading || s.pushActive || s.isStopping;

  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const errTimer = useRef<number | null>(null);

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setError(true);
    setShaking(false);
    requestAnimationFrame(() => setShaking(true));
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => {
      setError(false);
      setShaking(false);
    }, 3200);
  };

  const handleScan = () => {
    if (s.isScanning) return;
    s.scan();
  };

  const imgCount = s.items.filter(m => m.type === "image").length;
  const vidCount = s.items.length - imgCount;
  const selCount = s.items.filter(m => m.selected).length;
  const pct = s.dlTotal > 0 ? Math.round((s.dlDone / s.dlTotal) * 100) : 0;

  // 下载状态机
  const [dlState, setDlState] = useState<"idle" | "loading" | "success" | "error">("idle");
  useEffect(() => {
    if (s.isDownloading) {
      setDlState("loading");
    } else if (s.dlTotal > 0 && s.dlDone >= s.dlTotal) {
      setDlState(s.errorCount > 0 ? "error" : "success");
      const t = setTimeout(() => setDlState("idle"), 2000);
      return () => clearTimeout(t);
    }
  }, [s.isDownloading, s.dlTotal, s.dlDone, s.errorCount]);

  const dlLabel = s.isDownloading
    ? `下载中 ${s.dlDone}/${s.dlTotal}`
    : dlState === "success"
      ? `已保存 ✅${s.completedCount}`
      : dlState === "error"
        ? `重试 ❌${s.errorCount}`
        : selCount > 0
          ? "下载所选"
          : "下载全部";

  return (
    <div className="xm">
      {/* 顶部标题栏（拖拽手柄 + 视图入口） */}
      <div {...dragHandleProps} className="xm-top cursor-move touch-none">
        <span className="hi flex items-center justify-center">
          <XLogo className="h-4 w-4" />
        </span>
        <h2>
          X Media
          <span className="ver">v7.7</span>
        </h2>
        <div className="flex items-center gap-1">
          <XmdTooltip content="下载历史" side="bottom">
            <button
              type="button"
              className="ib relative"
              aria-label="下载历史"
              onClick={() => s.setView(s.view === "history" ? "main" : "history")}
              onPointerDown={e => e.stopPropagation()}
            >
              <History className="h-4 w-4" strokeWidth={1.5} />
              {s.view === "history" && (
                <motion.span
                  layoutId="xmd-view-dot"
                  transition={SPRING_LAYOUT}
                  className="absolute bottom-1.5 inset-x-0 mx-auto h-1 w-1 rounded-full bg-[var(--soft-ink)]"
                />
              )}
            </button>
          </XmdTooltip>
          <XmdTooltip content="设置" side="bottom">
            <button
              type="button"
              className="ib relative"
              aria-label="设置"
              onClick={() => s.setView(s.view === "settings" ? "main" : "settings")}
              onPointerDown={e => e.stopPropagation()}
            >
              <Settings className="h-4 w-4" strokeWidth={1.5} />
              {s.view === "settings" && (
                <motion.span
                  layoutId="xmd-view-dot"
                  transition={SPRING_LAYOUT}
                  className="absolute bottom-1.5 inset-x-0 mx-auto h-1 w-1 rounded-full bg-[var(--soft-ink)]"
                />
              )}
            </button>
          </XmdTooltip>
          <XmdTooltip content="关于" side="bottom">
            <button
              type="button"
              className="ib relative"
              aria-label="关于"
              onClick={() => s.setView(s.view === "about" ? "main" : "about")}
              onPointerDown={e => e.stopPropagation()}
            >
              <Info className="h-4 w-4" strokeWidth={1.5} />
              {s.view === "about" && (
                <motion.span
                  layoutId="xmd-view-dot"
                  transition={SPRING_LAYOUT}
                  className="absolute bottom-1.5 inset-x-0 mx-auto h-1 w-1 rounded-full bg-[var(--soft-ink)]"
                />
              )}
            </button>
          </XmdTooltip>
          <XmdTooltip content="关闭窗口 (变为悬浮球 · Esc)" side="bottom">
            <button
              type="button"
              className="ib"
              aria-label="关闭窗口"
              onClick={s.toggleCollapsed}
              onPointerDown={e => e.stopPropagation()}
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </XmdTooltip>
        </div>
      </div>

      <div className="xm-div" />

      {/* 面板内容体 */}
      <motion.div layoutScroll className="xm-body xmd-scroll-hidden max-h-[82vh] overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${s.view}:${s.view === "main" && running ? "f" : "n"}`}
            initial={{ opacity: 0, x: 8, filter: "blur(2px)" }}
            animate={{
              opacity: 1,
              x: 0,
              filter: "blur(0px)",
              transition: { duration: DURATION_FAST, ease: EASE_SMOOTH_OUT },
            }}
            exit={{
              opacity: 0,
              x: -8,
              filter: "blur(2px)",
              transition: { duration: DURATION_QUICK, ease: EASE_SMOOTH_OUT },
            }}
          >
            {s.view === "settings" ? (
              <SettingsView />
            ) : s.view === "history" ? (
              <HistoryView />
            ) : s.view === "about" ? (
              <AboutView />
            ) : running && s.settings.anim.enabled ? (
              <DownloadAnim />
            ) : (
              <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
                {/* 保存位置 */}
                <motion.div variants={staggerItem}>
                  <div className="cap mb-1.5 flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-[var(--stage-muted)]" strokeWidth={1.5} />
                    <span>保存位置</span>
                  </div>
                  <div className="xm-row">
                    <div className="xm-field" title={s.dirHandle ? s.folderName : ""}>
                      <span className="txt">
                        <SwapText value={s.dirHandle ? `📁 ${s.folderName}` : "未选择 · 默认下载目录"} />
                      </span>
                    </div>
                    <button
                      type="button"
                      className="xm-btn"
                      onClick={s.dirHandle ? s.clearFolder : s.selectFolder}
                      disabled={!s.fsApiSupported}
                      title={!s.fsApiSupported ? "需 Chrome/Edge 浏览器" : ""}
                    >
                      {!s.fsApiSupported ? "不支持" : s.dirHandle ? "清除" : "选择"}
                    </button>
                  </div>
                </motion.div>

                {/* 账号 / 子目录 + 跳过开关 */}
                <motion.div variants={staggerItem}>
                  <div className="xm-row">
                    <div className={cn("xm-field", error && "is-error", shaking && "is-shaking")}>
                      <User className="h-4 w-4 shrink-0 text-[var(--stage-muted)]" strokeWidth={1.5} />
                      <input
                        value={s.subfolder}
                        placeholder={
                          getPageContext().type === "search" && getPageContext().query
                            ? `搜索: ${getPageContext().query}`
                            : "@账号 / 子目录"
                        }
                        aria-label="账号"
                        onChange={e => {
                          s.setSubfolder(e.target.value);
                          if (error) {
                            setError(false);
                            setShaking(false);
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleScan();
                        }}
                      />
                      {s.subfolder && (
                        <button
                          type="button"
                          className="h-4 w-4 shrink-0 text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors p-0 border-0 bg-transparent cursor-pointer flex items-center justify-center"
                          onClick={() => {
                            s.setSubfolder("");
                            setError(false);
                            setShaking(false);
                          }}
                          aria-label="清空输入"
                          title="清空"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <span className="cap shrink-0">已下载自动跳过</span>
                  </div>
                  <div className={cn("xm-err", error && "is-error")}>
                    {errorMsg || "请先输入账号或子目录"}
                  </div>
                </motion.div>

                {/* 4 列数据统计卡 */}
                <motion.div variants={staggerItem} className="xm-stats">
                  <div className="st">
                    <span className="n"><Digits value={imgCount} /></span>
                    <span className="cap">图片</span>
                  </div>
                  <div className="st">
                    <span className="n"><Digits value={vidCount} /></span>
                    <span className="cap">视频</span>
                  </div>
                  <div className="st hl">
                    <span className="n"><Digits value={selCount} /></span>
                    <span className="cap">选中</span>
                  </div>
                  <div className="st">
                    <span className="n"><Digits value={s.items.length} /></span>
                    <span className="cap">总计</span>
                  </div>
                </motion.div>

                {/* 过滤条 + 选择操作 */}
                <motion.div variants={staggerItem} className="xm-bar">
                  <SlidingTabs
                    label="类型"
                    value={s.filter}
                    onChange={v => s.setFilter(v as FilterKind)}
                    options={[
                      { k: "all", label: "全部" },
                      { k: "image", label: "图片" },
                      { k: "video", label: "视频" },
                    ]}
                  />
                  <div className="xm-acts">
                    <button type="button" className="xm-lnk" onClick={s.selectAll}>全选</button>
                    <button type="button" className="xm-lnk" onClick={s.invertSelection}>反选</button>
                    <button type="button" className="xm-lnk" onClick={s.clearSelection}>清空</button>
                  </div>
                </motion.div>

                {/* 视图切换 (List / Card / Pack) */}
                <motion.div variants={staggerItem}>
                  <SlidingTabs
                    full
                    label="视图"
                    value={s.mediaView}
                    onChange={v => s.setMediaView(v as MediaViewKind)}
                    options={[
                      { k: "list", label: "列表", icon: <ListIcon className="h-4 w-4" strokeWidth={1.5} /> },
                      { k: "card", label: "卡片", icon: <GridIcon className="h-4 w-4" strokeWidth={1.5} /> },
                      { k: "tweet", label: "推文", icon: <ImagesIcon className="h-4 w-4" strokeWidth={1.5} /> },
                      { k: "pack", label: "打包", icon: <Layers className="h-4 w-4" strokeWidth={1.5} /> },
                    ]}
                  />
                </motion.div>

                {/* 媒体展示容器 */}
                <motion.div variants={staggerItem} className="xm-panel">
                  <Grid />
                </motion.div>

                {/* 操作按钮组 (扫描 / 加载 / API) */}
                <motion.div variants={staggerItem} className="xm-row">
                  <button
                    type="button"
                    className="xm-btn pri lead flex-1"
                    onClick={handleScan}
                    disabled={s.isScanning}
                  >
                    {s.isScanning ? <span className="spin" /> : <Search className="h-4 w-4" strokeWidth={1.5} />}
                    <SwapText value={s.isScanning ? "扫描中" : "扫描"} />
                  </button>
                  <button
                    type="button"
                    className="xm-btn pri lead flex-1"
                    onClick={() => (s.isAutoScrolling ? s.stopAutoScroll() : s.startAutoScroll())}
                    disabled={s.isScanning}
                  >
                    {s.isAutoScrolling ? <Square className="h-3.5 w-3.5 fill-current" /> : <Waves className="h-4 w-4" strokeWidth={1.5} />}
                    <SwapText value={s.isAutoScrolling ? "停止" : "加载"} />
                  </button>
                  <XmdTooltip content="通过 X GraphQL API 分页抓取" side="top">
                    <button
                      type="button"
                      className="xm-btn"
                      onClick={() => (s.isApiFetching ? s.stopAny() : s.apiFetch())}
                      disabled={s.isScanning}
                    >
                      {s.isApiFetching ? <Square className="h-3.5 w-3.5 fill-current" /> : <Cloud className="h-4 w-4" strokeWidth={1.5} />}
                      API
                    </button>
                  </XmdTooltip>
                </motion.div>

                {/* 大下载按钮 */}
                <motion.div variants={staggerItem}>
                  <button
                    type="button"
                    className={cn(
                      "xm-dl",
                      s.isDownloading && "is-busy",
                      dlState === "success" && "is-done",
                    )}
                    onClick={s.downloadAll}
                    disabled={s.isDownloading || s.items.length === 0}
                    style={{ ["--p" as string]: pct / 100 } as React.CSSProperties}
                  >
                    <span className="fill" />
                    <Download className="h-4 w-4" strokeWidth={1.5} />
                    <SwapText value={dlLabel} />
                    {s.items.length > 0 && (
                      <span className="meta" style={{ color: "inherit", fontWeight: 500 }}>
                        <Digits value={selCount > 0 ? selCount : s.items.length} />
                      </span>
                    )}
                  </button>
                </motion.div>

                {/* 失败重试入口 */}
                {!running && s.errorCount > 0 && (
                  <motion.div variants={staggerItem} className="xm-row">
                    <button
                      type="button"
                      className="xm-btn w-full bg-red-600/90 text-white hover:bg-red-600"
                      onClick={s.retryFailed}
                    >
                      <RotateCcw className="h-3 w-3" />
                      重试 {s.errorCount} 个失败媒体
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
