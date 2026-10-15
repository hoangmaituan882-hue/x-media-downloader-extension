// 专注模式进度网格：采集期镗刻实时计数，下载期一格一媒体（done=圆环/error=洞），
// 指针刷可擦玩。look 循环器每 2.6s 热切换配色/纹理/过渡/圆方，避免单调。
// 网格密度（cols）由阶段决定：采集期固定保证数字清晰，下载期按队列长度动态铺满。

import { useEffect, useRef } from "react";
import { DotCut } from "./dotcut/engine";
import { rasterize, type TransitionKind } from "./dotcut/scenes";
import { useXmd } from "@/core/engine";
import { ProgressMarquee } from "./ProgressMarquee";

const FONT = "-apple-system, 'Segoe UI', 'Noto Sans SC', sans-serif";

/** look 组合：palette 调色板 / style 纹理场 / trans 过渡动效 / sq 圆→方。
 * 注意不含 cols——cols 由阶段决定，避免 look 循环触发 resize 造成网格形态突变。 */
const LOOKS: { palette: number; style: number; trans: TransitionKind; sq: number }[] = [
  { palette: 0, style: 0, trans: "wipe", sq: 0 },
  { palette: 2, style: 3, trans: "ripple", sq: 0 },
  { palette: 1, style: 1, trans: "columns", sq: 0.9 },
  { palette: 3, style: 2, trans: "scatter", sq: 0 },
  { palette: 5, style: 0, trans: "collapse", sq: 0.55 },
  { palette: 4, style: 3, trans: "wipe", sq: 1 },
];
const LOOK_MS = 2600;

/** 采集期固定密度：保证数字光栅化足够清晰 */
const COLLECT_COLS = 34;

/** 下载期动态密度：找一个 cols 使 cols*rows >= n 且最接近 n，让队列铺满网格 */
function fitCols(n: number, w: number, h: number): number {
  if (n <= 1) return 6;
  let best = 6;
  let bestGap = Infinity;
  for (let cols = 6; cols <= 40; cols++) {
    const pitch = w / (cols + 1.5); // 与 engine 的 margin=0.75 一致
    const rows = Math.max(3, Math.floor((h - 1.5 * pitch) / pitch));
    const cells = cols * rows;
    if (cells >= n && cells - n < bestGap) {
      bestGap = cells - n;
      best = cols;
    }
  }
  // 队列超过最大网格容量时退回最密网格（40 列）
  return bestGap === Infinity ? 40 : best;
}

export function DotcutTheme({ stopping }: { stopping?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<DotCut | null>(null);
  const phaseRef = useRef<"idle" | "collect" | "download" | "stopping">("idle");
  const lookRef = useRef(0);
  const applyRef = useRef<(rescatter?: boolean) => void>(() => {});

  const items = useXmd(s => s.items);
  const isDownloading = useXmd(s => s.isDownloading);
  const collecting = useXmd(s => s.isAutoScrolling || s.isApiFetching || s.pushActive);
  const active = (isDownloading || collecting) && !stopping;

  // 跑马灯速度随实时吞吐变化：近 3 秒完成数越多流得越快
  const dlDone = useXmd(s => s.dlDone);
  const rateRef = useRef<number[]>([]);
  const prevDone = useRef(0);
  useEffect(() => {
    if (dlDone > prevDone.current) rateRef.current.push(Date.now());
    prevDone.current = dlDone;
    rateRef.current = rateRef.current.filter(t => Date.now() - t < 3000);
  }, [dlDone]);
  const speed = 30 + Math.min(90, rateRef.current.length * 10);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const dot = new DotCut(el, FONT);
    dot.setAutoCycle(false);
    dot.setParams({ cols: COLLECT_COLS, brush: 2.4 });
    dot.start();
    dotRef.current = dot;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      dot.setPointer(dot.toCell(e.clientX - r.left, e.clientY - r.top));
    };
    const onLeave = () => dot.setPointer(null);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      dot.destroy();
      dotRef.current = null;
      phaseRef.current = "idle";
    };
  }, []);

  // look 循环：只热切换配色/纹理/过渡/圆方（都平滑），不切 cols
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      const dot = dotRef.current;
      if (!dot) return;
      lookRef.current = (lookRef.current + 1) % LOOKS.length;
      const look = LOOKS[lookRef.current];
      dot.setLook({ palette: look.palette, style: look.style, trans: look.trans, squareness: look.sq });
      applyRef.current(true);
    }, LOOK_MS);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;
    const host = hostRef.current;
    const w = host?.clientWidth || 320;
    const h = host?.clientHeight || 210;
    const mode: "idle" | "collect" | "download" = isDownloading ? "download" : collecting ? "collect" : "idle";

    const apply = (rescatter = false) => {
      if (mode === "collect") {
        // 固定密度，数字光栅清晰
        if (dot.params.cols !== COLLECT_COLS) dot.setLook({ cols: COLLECT_COLS });
        const { cols, rows } = dot.grid;
        const look = LOOKS[lookRef.current];
        dot.setManual(
          rasterize(
            { kind: "text", value: String(items.length), transition: look.trans, palette: look.palette },
            cols,
            rows,
            FONT,
          ),
          new Float32Array(cols * rows),
          look.trans,
          rescatter,
        );
      } else if (mode === "download") {
        // 动态密度：一格一媒体铺满网格（修复队列只占左上角小块的问题）
        const cols = fitCols(items.length, w, h);
        if (dot.params.cols !== cols) dot.setLook({ cols });
        const { cols: c, rows: r } = dot.grid;
        const n = c * r;
        const mask = new Float32Array(n);
        const bore = new Float32Array(n);
        items.forEach((it, i) => {
          if (i >= n) return;
          mask[i] = it.status === "error" ? 0 : 1;
          bore[i] = it.status === "done" ? 1 : it.status === "loading" ? 0.45 : 0;
        });
        const look = LOOKS[lookRef.current];
        dot.setManual(mask, bore, look.trans, rescatter);
      }
    };
    applyRef.current = apply;

    if (mode === phaseRef.current) {
      // 同阶段增量更新：不重排延迟，变化的格自行 morph
      if (mode !== "idle") apply(false);
      return;
    }

    // 阶段切换：直接切 look + 重排，不经过场景字符，数字与队列平滑 morph 衔接
    phaseRef.current = mode;
    if (mode === "collect") {
      lookRef.current = 0;
      dot.setLook({
        palette: LOOKS[0].palette,
        style: LOOKS[0].style,
        trans: LOOKS[0].trans,
        squareness: LOOKS[0].sq,
      });
      apply(true);
    } else if (mode === "download") {
      lookRef.current = 1;
      dot.setLook({
        palette: LOOKS[1].palette,
        style: LOOKS[1].style,
        trans: LOOKS[1].trans,
        squareness: LOOKS[1].sq,
      });
      apply(true);
    } else {
      dot.gotoScene(1, false);
    }
  }, [items, isDownloading, collecting, stopping]);

  // 停止中断动画：点阵光栅化 "STOP" 字符并执行离散消散
  useEffect(() => {
    if (!stopping) return;
    const dot = dotRef.current;
    if (!dot) return;
    const { cols, rows } = dot.grid;
    phaseRef.current = "stopping";
    dot.setLook({ palette: 4, style: 2, trans: "scatter", squareness: 0.85 });
    dot.setManual(
      rasterize(
        { kind: "text", value: "STOP", transition: "scatter", palette: 4 },
        cols,
        rows,
        FONT,
      ),
      new Float32Array(cols * rows),
      "scatter",
      true,
    );
  }, [stopping]);

  return (
    <>
      <div className="xmd-mesh relative">
        <div ref={hostRef} className="xmd-mesh-canvas" />
        {stopping && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition-opacity duration-300">
            <span className="rounded-full bg-red-950/80 px-3 py-1 text-xs font-semibold text-red-300 border border-red-500/30 shadow-lg">
              ⏹ 任务已停止
            </span>
          </div>
        )}
      </div>
      {/* 底部跑马灯：已完成媒体流动展示进度 */}
      <ProgressMarquee items={items} rows={1} speed={stopping ? 0 : speed} />
    </>
  );
}
