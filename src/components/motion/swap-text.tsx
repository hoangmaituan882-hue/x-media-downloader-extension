import { useEffect, useRef, useState } from "react";

export function SwapText({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (shown === value) return;
    const el = ref.current;
    if (!el) {
      setShown(value);
      return;
    }
    el.classList.add("is-exit");
    const t = setTimeout(() => {
      setShown(value);
      el.classList.remove("is-exit");
      el.classList.add("is-enter-start");
      void el.offsetHeight;
      requestAnimationFrame(() => {
        el.classList.remove("is-enter-start");
      });
    }, 150);
    return () => clearTimeout(t);
  }, [value, shown]);

  return (
    <span ref={ref} className={`t-text-swap ${className || ""}`}>
      {shown}
    </span>
  );
}
