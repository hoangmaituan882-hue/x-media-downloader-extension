// 跑马灯缩略图条：rAF 横向滚动，已完成媒体流入，展示下载进度。
// 多行时奇偶行反向，形成画廊流动感。

import { useEffect, useRef } from "react";
import { Film, Image as ImageIcon } from "lucide-react";
import type { MediaItem } from "@/core/types";

export function ProgressMarquee({
  items,
  rows = 1,
  speed = 40,
}: {
  items: MediaItem[];
  rows?: number;
  speed?: number;
}) {
  const done = items.filter(i => i.status === "done");
  if (!done.length) return null;
  return (
    <div className="xmd-marquee">
      {Array.from({ length: rows }, (_, r) => (
        <MarqueeRow
          key={r}
          items={done.filter((_, i) => i % rows === r)}
          dir={r % 2 === 0 ? 1 : -1}
          speed={speed}
        />
      ))}
    </div>
  );
}

function MarqueeRow({ items, dir, speed }: { items: MediaItem[]; dir: 1 | -1; speed: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    if (dir === -1) el.scrollLeft = el.scrollWidth;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const max = el.scrollWidth - el.clientWidth;
      if (max > 4) {
        el.scrollLeft += dt * speed * dir;
        if (el.scrollLeft >= max) el.scrollLeft = 0;
        else if (el.scrollLeft <= 0 && dir === -1) el.scrollLeft = max;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dir, speed]);

  if (!items.length) return null;
  return (
    <div ref={ref} className="xmd-marquee-row xmd-scroll-hidden">
      {items.map((it, i) => (
        <span
          key={it.id}
          className="t"
          title={it.fileName}
          style={it.thumbnail ? undefined : { background: `hsl(${(i * 47 + 200) % 360} 55% 78%)` }}
        >
          {it.thumbnail ? (
            <img src={it.thumbnail} loading="lazy" alt="" />
          ) : it.type === "video" ? (
            <Film className="h-3.5 w-3.5" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
        </span>
      ))}
    </div>
  );
}
