import { useCallback, useRef } from "react";

export interface CardTiltOptions {
  /** Maximum tilt angle in degrees. Default 3.2° (subtle, non-distorting). */
  maxTilt?: number;
}

export function useCardTilt({ maxTilt = 3.2 }: CardTiltOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;

      // Normalised -1 to +1 from center
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;

      // Invert Y axis for rotateX
      const rx = (-ny * maxTilt).toFixed(2);
      const ry = (nx * maxTilt).toFixed(2);
      const gx = (((e.clientX - r.left) / r.width) * 100).toFixed(1);
      const gy = (((e.clientY - r.top) / r.height) * 100).toFixed(1);

      el.style.setProperty("--tilt-rx", `${rx}deg`);
      el.style.setProperty("--tilt-ry", `${ry}deg`);
      el.style.setProperty("--tilt-gx", `${gx}%`);
      el.style.setProperty("--tilt-gy", `${gy}%`);
      el.classList.add("is-tilting", "is-hover");
    },
    [maxTilt],
  );

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("is-tilting", "is-hover");
    el.style.setProperty("--tilt-rx", "0deg");
    el.style.setProperty("--tilt-ry", "0deg");
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}
