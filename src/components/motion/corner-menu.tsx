import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, type Transition } from "motion/react";
import { Search, History, Settings, Maximize2, Sparkles, Info } from "lucide-react";
import { XLogo } from "@/ui/icons";
import { useXmd } from "@/core/engine";
import { cn } from "@/lib/utils";

export const SPRING_TRANSITION: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 26,
  mass: 0.8,
};

export const SPRING_MORPH: Transition = {
  type: "spring",
  stiffness: 340,
  damping: 28,
  mass: 0.85,
};

export const QUICK_SPRING: Transition = {
  type: "spring",
  stiffness: 480,
  damping: 28,
};

interface CornerMenuProps {
  onExpandPanel: () => void;
  isDownloading?: boolean;
  itemCount?: number;
  isDragging?: () => boolean;
}

export function MotionCornerTrigger({
  onExpandPanel,
  isDownloading,
  itemCount = 0,
  isDragging,
}: CornerMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [impactKey, setImpactKey] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const setView = useXmd(s => s.setView);
  const scan = useXmd(s => s.scan);

  // 监听流星微粒命中悬浮球事件（Transitions.dev Pattern 29 果冻回弹）
  useEffect(() => {
    const onImpact = () => setImpactKey(k => k + 1);
    window.addEventListener("xmd-orb-impact", onImpact);
    return () => window.removeEventListener("xmd-orb-impact", onImpact);
  }, []);

  // 点击外部收起快捷菜单
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleAction = (action: "scan" | "history" | "settings" | "about" | "expand") => {
    setMenuOpen(false);
    if (action === "scan") {
      onExpandPanel();
      setTimeout(() => void scan(), 150);
    } else if (action === "history") {
      setView("history");
      onExpandPanel();
    } else if (action === "settings") {
      setView("settings");
      onExpandPanel();
    } else if (action === "about") {
      setView("about");
      onExpandPanel();
    } else {
      onExpandPanel();
    }
  };

  return (
    <div ref={menuRef} className="relative select-none pointer-events-auto">
      {/* 快捷动作分步扇出 (Stepped Corner Actions) */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 10 }}
            transition={SPRING_TRANSITION}
            className="absolute right-0 top-14 flex flex-col gap-1.5 p-1.5 rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl z-50 min-w-[148px]"
          >
            <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase text-zinc-400 dark:text-zinc-500 flex items-center justify-between">
              <span>快捷动作</span>
              <Sparkles className="w-3 h-3 text-violet-500" />
            </div>

            <motion.button
              whileHover={{ x: 2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction("scan")}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-colors text-left"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Search className="w-3.5 h-3.5" />
              </span>
              <span>扫描媒体</span>
            </motion.button>

            <motion.button
              whileHover={{ x: 2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction("history")}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <History className="w-3.5 h-3.5" />
              </span>
              <span>下载历史</span>
            </motion.button>

            <motion.button
              whileHover={{ x: 2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction("settings")}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-500/10 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors text-left"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-500/10 text-zinc-600 dark:text-zinc-400">
                <Settings className="w-3.5 h-3.5" />
              </span>
              <span>配置中心</span>
            </motion.button>

            <motion.button
              whileHover={{ x: 2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction("about")}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-500/10 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors text-left"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-500/10 text-zinc-600 dark:text-zinc-400">
                <Info className="w-3.5 h-3.5" />
              </span>
              <span>关于软件</span>
            </motion.button>

            <div className="h-[1px] bg-zinc-200/60 dark:bg-zinc-800/60 my-0.5" />

            <motion.button
              whileHover={{ x: 2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction("expand")}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-500/15 transition-colors text-left"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-600 text-white shadow-sm">
                <Maximize2 className="w-3.5 h-3.5" />
              </span>
              <span>展开完整面板</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 核心紧凑悬浮球 (Compact Spring Floating Orb) */}
      <motion.div
        key={`orb-${impactKey}`}
        animate={
          impactKey > 0
            ? {
                scale: [1, 1.18, 0.94, 1.05, 1],
                transition: { duration: 0.45, ease: [0.34, 1.36, 0.64, 1] },
              }
            : undefined
        }
        whileHover={{ scale: 1.06, rotate: menuOpen ? 90 : 2 }}
        whileTap={{ scale: 0.94 }}
        transition={QUICK_SPRING}
        className="relative group"
      >
        {/* 微光流星命中时的冲击微光环 */}
        {impactKey > 0 && (
          <motion.span
            key={`ring-${impactKey}`}
            initial={{ scale: 0.9, opacity: 0.85 }}
            animate={{ scale: 1.75, opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="absolute inset-0 rounded-full border-2 border-[var(--soft-ink)] pointer-events-none"
          />
        )}
        <button
          onClick={() => {
            if (isDragging && isDragging()) return;
            if (menuOpen) setMenuOpen(false);
            else onExpandPanel();
          }}
          onContextMenu={e => {
            e.preventDefault();
            setMenuOpen(v => !v);
          }}
          title="点击展开面板 · 按住可自由拖拽 · 右键快捷菜单"
          aria-label="展开 X Media Downloader 面板"
          className={cn(
            "relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full",
            "bg-[var(--stage-surface)] backdrop-blur-xl",
            "border border-[var(--stage-border)]",
            "shadow-[0_8px_30px_rgba(0,0,0,0.16),0_2px_8px_rgba(0,0,0,0.06)]",
            "transition-colors duration-200",
            menuOpen && "ring-2 ring-[var(--soft-ink)] border-[var(--soft-ink)]",
          )}
        >
          {/* 光泽微发光层 */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[var(--soft)]/20 via-transparent to-white/30 dark:to-white/5 pointer-events-none" />

          {/* X 矢量 Logo */}
          <span className="inline-flex text-[var(--stage-fg)] z-10 transition-transform group-hover:scale-110">
            <XLogo className="h-5 w-5" />
          </span>

          {/* 下载状态：环形加载微光与呼吸光晕 */}
          {isDownloading ? (
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          ) : null}

          {/* 活跃状态脉冲光点 / 数量角标 */}
          {isDownloading ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 ring-2 ring-[var(--stage-surface)]" />
            </span>
          ) : itemCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[var(--stage-accent)] text-[9.5px] font-bold text-[var(--stage-on-accent)] shadow-sm ring-2 ring-[var(--stage-surface)] tabular-nums">
              {itemCount > 99 ? "99+" : itemCount}
            </span>
          ) : null}
        </button>

        {/* 快捷展开浮动小手柄 (点选可直接切菜单) */}
        <button
          onClick={e => {
            e.stopPropagation();
            setMenuOpen(v => !v);
          }}
          title={menuOpen ? "关闭快捷菜单" : "快捷动作菜单"}
          className={cn(
            "absolute -bottom-1 -left-1 flex h-4.5 w-4.5 items-center justify-center rounded-full",
            "bg-[var(--chip)] text-[var(--stage-muted)]",
            "border border-[var(--stage-border)] shadow-xs",
            "hover:bg-[var(--stage-accent)] hover:text-[var(--stage-on-accent)] hover:border-transparent transition-all",
            menuOpen && "bg-[var(--stage-accent)] text-[var(--stage-on-accent)] border-transparent rotate-45",
          )}
        >
          <Sparkles className="w-2.5 h-2.5" />
        </button>
      </motion.div>
    </div>
  );
}
