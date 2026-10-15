// 下载动画宿主：运行时接管面板，按设置渲染主题 + 顶栏计数 + 停止。

import { Square } from "lucide-react";
import { useXmd } from "@/core/engine";
import { Button } from "@/components/motion/button";
import { ANIM_THEMES } from "./themes";
import { cn } from "@/lib/utils";

export function DownloadAnim() {
  const s = useXmd();
  const def = ANIM_THEMES.find(t => t.id === s.settings.anim.theme) ?? ANIM_THEMES[0];
  const collecting = s.isAutoScrolling || s.isApiFetching || s.pushActive;
  const isStopping = s.isStopping;
  const stat = isStopping
    ? `正在终止 · 已保留 ${s.items.length} 项`
    : collecting
      ? `加载 ${s.items.length}`
      : `已下载 ${s.dlDone}/${s.dlTotal}`;
  const C = def.C;

  return (
    <div>
      <div className="xmd-focus-top">
        <span className="xmd-focus-name">{def.name}</span>
        <span className={cn("xmd-focus-stat", isStopping && "text-amber-500 font-semibold")}>
          {stat}
        </span>
      </div>
      <C stopping={isStopping} />
      <Button
        variant="secondary"
        className={cn(
          "w-full transition-colors",
          isStopping
            ? "bg-amber-600/90 text-white cursor-not-allowed opacity-90"
            : "bg-red-600 text-white hover:bg-red-700",
        )}
        onClick={s.stopAny}
        disabled={isStopping}
      >
        {isStopping ? (
          <>
            <span className="spin mr-1.5 h-3 w-3 border-2 border-white/30 border-t-white rounded-full" />
            正在停止…
          </>
        ) : (
          <>
            <Square className="h-3 w-3 fill-current" />
            停止
          </>
        )}
      </Button>
    </div>
  );
}
