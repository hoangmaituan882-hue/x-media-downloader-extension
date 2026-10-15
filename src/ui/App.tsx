import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useXmd } from "@/core/engine";
import { PanelBody } from "./Panel";
import { ToastHost } from "./ToastHost";
import { FloatCard } from "./FloatCard";
import { PortalRootContext } from "./context";
import { MotionCornerTrigger } from "@/components/motion/corner-menu";
import { DURATION_FAST, DURATION_MEDIUM, DURATION_QUICK, EASE_SMOOTH_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

export function App({ host }: { host: HTMLElement }) {
  const collapsed = useXmd(s => s.collapsed);
  const toggleCollapsed = useXmd(s => s.toggleCollapsed);
  const isDownloading = useXmd(s => s.isDownloading);
  const itemCount = useXmd(s => s.items.length);
  const dragControls = useDragControls();

  // 拖拽位置记忆：下次打开面板回到上次位置
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("xmd_panel_pos") || "null");
    } catch {
      return null;
    }
  });

  // 拖拽约束 = 宿主元素（覆盖整个视口），Motion 需要 ref 形式
  const hostRef = useRef<Element | null>(host);
  const shadowRoot = host.shadowRoot;

  // 拖拽状态标记：防止拖动悬浮球松手时意外触发展开点击
  const isDraggingRef = useRef(false);
  const [isDocked, setIsDocked] = useState(false);
  const dockTimerRef = useRef<number | null>(null);

  const resetDockTimer = () => {
    setIsDocked(false);
    if (dockTimerRef.current) clearTimeout(dockTimerRef.current);
    if (collapsed) {
      dockTimerRef.current = window.setTimeout(() => {
        setIsDocked(true);
      }, 3500);
    }
  };

  useEffect(() => {
    resetDockTimer();
    return () => {
      if (dockTimerRef.current) clearTimeout(dockTimerRef.current);
    };
  }, [collapsed]);

  // 视口边界钳制，防止悬浮球或面板被拖出可视范围之外
  const clampPos = (p: { x: number; y: number }) => {
    const maxX = Math.max(10, window.innerWidth - (collapsed ? 64 : 360));
    const maxY = Math.max(10, window.innerHeight - (collapsed ? 64 : 400));
    return {
      x: Math.min(Math.max(10, p.x), maxX),
      y: Math.min(Math.max(10, p.y), maxY),
    };
  };

  // Escape 折叠面板；焦点在面板内（事件目标被重定向为 host）时不触发
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.target === host || (e.target instanceof Element && host.contains(e.target))) return;
      if (!collapsed) toggleCollapsed();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [host, collapsed, toggleCollapsed]);

  return (
    <PortalRootContext.Provider value={shadowRoot}>
      <motion.div
        drag
        dragListener={collapsed}
        dragControls={dragControls}
        dragMomentum={false}
        dragConstraints={hostRef}
        onPointerEnter={() => {
          setIsDocked(false);
          if (dockTimerRef.current) clearTimeout(dockTimerRef.current);
        }}
        onPointerLeave={() => {
          if (collapsed) {
            dockTimerRef.current = window.setTimeout(() => {
              setIsDocked(true);
            }, 3500);
          }
        }}
        className="pointer-events-auto fixed right-5 top-5 z-50 select-none"
        style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
        onDragStart={() => {
          isDraggingRef.current = true;
          setIsDocked(false);
          if (dockTimerRef.current) clearTimeout(dockTimerRef.current);
        }}
        onDragEnd={e => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          let targetX = Math.round(r.left);
          let targetY = Math.round(r.top);

          if (collapsed) {
            // 边缘磁吸贴边：按左右半屏吸附到左右边缘
            const centerX = r.left + r.width / 2;
            const snapLeft = 16;
            const snapRight = window.innerWidth - 64;
            targetX = centerX < window.innerWidth / 2 ? snapLeft : snapRight;
          }

          const p = clampPos({ x: targetX, y: targetY });
          setPos(p);
          try {
            localStorage.setItem("xmd_panel_pos", JSON.stringify(p));
          } catch { /* ignore */ }
          setTimeout(() => {
            isDraggingRef.current = false;
          }, 120);
          resetDockTimer();
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.div
              key="collapsed-orb"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: isDocked ? 0.6 : 1,
                scale: isDocked ? 0.92 : 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.8,
                transition: { duration: DURATION_QUICK, ease: EASE_SMOOTH_OUT },
              }}
              transition={{
                duration: DURATION_QUICK,
                ease: EASE_SMOOTH_OUT,
              }}
              className="w-12 h-12 flex items-center justify-center cursor-grab active:cursor-grabbing"
            >
              <MotionCornerTrigger
                onExpandPanel={() => {
                  if (isDraggingRef.current) return;
                  toggleCollapsed();
                }}
                isDownloading={isDownloading}
                itemCount={itemCount}
                isDragging={() => isDraggingRef.current}
              />
            </motion.div>
          ) : (
            <motion.div
              key="expanded-panel"
              initial={{
                opacity: 0,
                scale: 0.94,
                y: -6,
                filter: "blur(2px)",
              }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                filter: "blur(0px)",
                transition: { duration: DURATION_FAST, ease: EASE_SMOOTH_OUT },
              }}
              exit={{
                opacity: 0,
                scale: 0.94,
                y: -6,
                filter: "blur(2px)",
                transition: { duration: DURATION_QUICK, ease: EASE_SMOOTH_OUT },
              }}
              style={{
                originX: pos && pos.x < window.innerWidth / 2 ? 0 : 1,
                originY: 0,
              }}
              className="w-[360px] rounded-[24px] bg-[var(--stage-surface)] shadow-[var(--shadow-card)] overflow-hidden border-0"
            >
              <PanelBody
                dragHandleProps={{ onPointerDown: (e: React.PointerEvent) => dragControls.start(e) }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <FloatCard />
      <ToastHost portalRoot={shadowRoot as unknown as Element} />
    </PortalRootContext.Provider>
  );
}
