// 主题「跑马灯画廊」：大计数 + 三行反向跑马灯缩略图墙。

import { useXmd } from "@/core/engine";
import { ProgressMarquee } from "./ProgressMarquee";
import { cn } from "@/lib/utils";

export function MarqueeTheme({ stopping }: { stopping?: boolean }) {
  const items = useXmd(s => s.items);
  const dlDone = useXmd(s => s.dlDone);
  const dlTotal = useXmd(s => s.dlTotal);

  return (
    <div className={cn("xmd-anim-marquee-wrap relative transition-all duration-300", stopping && "ring-1 ring-amber-500/40")}>
      <div className={cn("xmd-marquee-big transition-opacity duration-300", stopping && "opacity-60")}>
        {dlDone}
        <span>/{dlTotal}</span>
      </div>
      <ProgressMarquee items={items} rows={3} speed={stopping ? 0 : 55} />
      {stopping && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 backdrop-blur-[2px] transition-all duration-300 animate-in fade-in">
          <div className="flex flex-col items-center gap-1 rounded-xl bg-neutral-900/90 px-4 py-2 border border-amber-500/30 text-amber-300 shadow-xl">
            <span className="text-xs font-semibold">⏹ 任务已停止</span>
            <span className="text-[10px] text-zinc-400">已保留当前 {items.length} 个媒体</span>
          </div>
        </div>
      )}
    </div>
  );
}
