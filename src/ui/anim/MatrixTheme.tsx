// 主题「矩阵代码雨」：赛博数字流瀑布 + 全息解密卡片 + 终端监控 HUD。
// 支持光标力场互动、下载吞吐率计算与文本实时解密破译动效。

import { useEffect, useRef, useState, useMemo } from "react";
import { Film, Image as ImageIcon, Terminal, Zap } from "lucide-react";
import { useXmd } from "@/core/engine";
import { cn } from "@/lib/utils";

const GLYPHS = "ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789ABCDEF<>/*+~$#%&";

export function MatrixTheme({ stopping }: { stopping?: boolean }) {
  const items = useXmd(s => s.items);
  const dlDone = useXmd(s => s.dlDone);
  const dlTotal = useXmd(s => s.dlTotal);
  const isDownloading = useXmd(s => s.isDownloading);
  const collecting = useXmd(s => s.isAutoScrolling || s.isApiFetching || s.pushActive);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({ x: -1, y: -1, active: false });

  // 吞吐率计算（近 3 秒每秒完成项）
  const rateRef = useRef<number[]>([]);
  const prevDone = useRef(dlDone);
  const [speed, setSpeed] = useState(0);

  useEffect(() => {
    const now = Date.now();
    if (dlDone > prevDone.current) {
      rateRef.current.push(now);
      prevDone.current = dlDone;
    }
    rateRef.current = rateRef.current.filter(t => now - t < 3000);
    setSpeed(Number((rateRef.current.length / 3).toFixed(1)));
  }, [dlDone]);

  // 当前激活/解密中的媒体对象
  const activeItem = useMemo(() => {
    if (!items.length) return null;
    const idx = Math.min(Math.max(0, dlDone - 1), items.length - 1);
    return items[idx] ?? items[0];
  }, [items, dlDone]);

  // 字符随机破译动画（Scramble Decrypting Text）
  const [decryptedText, setDecryptedText] = useState("");
  useEffect(() => {
    const target = activeItem ? (activeItem.username ? `@${activeItem.username}` : activeItem.id.slice(0, 10)) : "STREAM_ACTIVE";
    let frame = 0;
    const totalFrames = 12;
    const interval = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const scrambled = target
        .split("")
        .map((char, i) => {
          if (char === " " || char === "@") return char;
          if (i / target.length < progress) return char;
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join("");
      setDecryptedText(scrambled);
      if (frame >= totalFrames) {
        clearInterval(interval);
        setDecryptedText(target);
      }
    }, 35);
    return () => clearInterval(interval);
  }, [activeItem, dlDone]);

  // Canvas 矩阵流渲染引擎
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const fontSize = 13;
    let columns = Math.floor(width / fontSize);
    let drops: number[] = Array.from({ length: columns }, () => Math.floor(Math.random() * -30));
    let speeds: number[] = Array.from({ length: columns }, () => 1 + Math.random() * 1.5);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
      columns = Math.floor(width / fontSize);
      drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -30));
      speeds = Array.from({ length: columns }, () => 1 + Math.random() * 1.5);
    };

    window.addEventListener("resize", handleResize);

    // 绘制循环
    const render = () => {
      // 尾迹渐隐（半透明背景刷新）
      ctx.fillStyle = "rgba(10, 12, 18, 0.22)";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${fontSize}px monospace`;

      const ptr = pointerRef.current;

      for (let i = 0; i < drops.length; i++) {
        const text = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // 光标力场检测：靠近光标时字符被推斥与激亮
        let isPerturbed = false;
        if (ptr.active) {
          const dx = x - ptr.x;
          const dy = y - ptr.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 55) {
            isPerturbed = true;
          }
        }

        // 头部亮白，正常为翡翠绿/紫光，停止中断态转为告警赤红与琥珀色
        if (stopping) {
          ctx.fillStyle = i % 2 === 0 ? "#ef4444" : "#f59e0b";
          ctx.shadowColor = "#ef4444";
          ctx.shadowBlur = 4;
        } else if (isPerturbed) {
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "#38bdf8";
          ctx.shadowBlur = 8;
        } else if (Math.random() > 0.88) {
          ctx.fillStyle = "#e0e7ff";
          ctx.shadowColor = "#818cf8";
          ctx.shadowBlur = 6;
        } else {
          ctx.fillStyle = i % 2 === 0 ? "#10b981" : "#8b5cf6";
          ctx.shadowBlur = 0;
        }

        ctx.fillText(text, x, y);

        // 重置到顶端
        if (y > height && Math.random() > 0.975) {
          drops[i] = 0;
          speeds[i] = 1 + Math.random() * 1.5;
        } else {
          drops[i] += speeds[i] * (stopping ? 0.35 : isPerturbed ? 2.5 : 1);
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    };
    const onPointerLeave = () => {
      pointerRef.current.active = false;
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  const pct = dlTotal > 0 ? Math.round((dlDone / dlTotal) * 100) : 0;
  const barBlocks = Math.round((pct / 100) * 12);
  const cyberBar = "■".repeat(barBlocks) + "□".repeat(Math.max(0, 12 - barBlocks));

  return (
    <div className="relative mb-2.5 h-[220px] w-full overflow-hidden rounded-xl border border-emerald-500/30 bg-zinc-950 font-mono text-xs select-none shadow-[0_0_25px_rgba(16,185,129,0.12)]">
      {/* 矩阵雨 Canvas 背景 */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-80" />

      {/* 扫描线质感光栅 */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.45)_50%)] bg-[length:100%_4px] opacity-40" />

      {/* 赛博顶栏 HUD */}
      <div className="absolute top-2 inset-x-2.5 flex items-center justify-between text-[10.5px] text-emerald-400/90 tracking-wider">
        <div className="flex items-center gap-1.5 font-bold">
          <Terminal className="h-3 w-3 text-emerald-400 animate-pulse" />
          <span>CYBER_STREAM</span>
          <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] text-emerald-300">
            {collecting ? "SCANNING" : isDownloading ? "DECRYPTING" : "ACTIVE"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
          <span className="flex items-center gap-0.5 text-emerald-400/90 font-semibold">
            <Zap className="h-3 w-3 text-amber-400 fill-amber-400" />
            {speed} it/s
          </span>
          <span className="text-zinc-500">|</span>
          <span>{pct}%</span>
        </div>
      </div>

      {/* 中央全息解密卡片 */}
      <div className="absolute inset-x-4 top-9 bottom-9 flex items-center justify-center">
        {activeItem ? (
          <div className="relative flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-zinc-900/85 p-2 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.6),inset_0_0_12px_rgba(16,185,129,0.15)] max-w-full">
            {/* 科技角标装饰 */}
            <span className="absolute -top-1 -left-1 text-[10px] text-emerald-400 leading-none">┌</span>
            <span className="absolute -top-1 -right-1 text-[10px] text-emerald-400 leading-none">┐</span>
            <span className="absolute -bottom-1 -left-1 text-[10px] text-emerald-400 leading-none">└</span>
            <span className="absolute -bottom-1 -right-1 text-[10px] text-emerald-400 leading-none">┘</span>

            {/* 缩略图扫描窗口 */}
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-emerald-500/50 bg-black/80">
              {activeItem.thumbnail ? (
                <img
                  src={activeItem.thumbnail}
                  alt=""
                  className="h-full w-full object-cover transition-opacity duration-300"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-emerald-500">
                  {activeItem.type === "video" ? <Film className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                </div>
              )}
              {/* 循环扫描光带 */}
              <div className="pointer-events-none absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399] animate-[cyber-scan_1.6s_ease-in-out_infinite]" />
            </div>

            {/* 解密信息流 */}
            <div className="flex flex-col justify-center gap-0.5 overflow-hidden">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  [{activeItem.type}]
                </span>
                <span className="text-[11px] font-bold text-zinc-100 truncate max-w-[130px]">
                  {decryptedText}
                </span>
              </div>
              <div className="text-[9.5px] text-zinc-400 truncate max-w-[150px]">
                ID: {activeItem.id}
              </div>
              <div className="text-[9px] text-emerald-400/80 font-semibold tracking-tight">
                STATUS: 200 OK · VERIFIED
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-emerald-400/80 text-[11px] font-mono animate-pulse">
            &gt; INITIALIZING DATA STREAM...
          </div>
        )}
      </div>

      {/* 底部监控终端条 */}
      <div className="absolute bottom-2 inset-x-2.5 flex items-center justify-between text-[10px] text-zinc-400">
        <div className="font-mono text-emerald-400 tracking-wider">
          [{cyberBar}]
        </div>
        <div className="font-semibold text-zinc-300">
          QUEUE: <span className="text-emerald-400">{dlDone}</span>/{dlTotal}
        </div>
      </div>

      {/* 停止中断覆盖层 */}
      {stopping && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/65 backdrop-blur-[2px] font-mono transition-opacity duration-300">
          <div className="border border-red-500/60 bg-black/85 px-4 py-2.5 rounded-lg text-center shadow-[0_0_24px_rgba(239,68,68,0.35)]">
            <span className="text-red-400 font-bold text-xs tracking-wider animate-pulse flex items-center justify-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              PROCESS_HALTED
            </span>
            <span className="text-[10.5px] text-zinc-400 mt-1 block">
              任务已安全终止 · 已保留 {items.length} 个媒体
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
