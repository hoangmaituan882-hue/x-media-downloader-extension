import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

export function SlidingTabs<T extends string | number>({
  options,
  value,
  onChange,
  full,
  label,
  className,
}: {
  options: { k: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (k: T) => void;
  full?: boolean;
  label: string;
  className?: string;
}) {
  const layoutId = useId();

  return (
    <motion.div
      layoutRoot
      className={cn("t-tabs", full && "full", className)}
      role="tablist"
      aria-label={label}
    >
      {options.map(o => {
        const isSelected = value === o.k;
        return (
          <button
            key={String(o.k)}
            className="t-tab relative select-none"
            role="tab"
            type="button"
            aria-selected={isSelected}
            onClick={() => onChange(o.k)}
          >
            {isSelected && (
              <motion.span
                layoutId={`tab-pill-${layoutId}`}
                transition={SPRING_LAYOUT}
                className="t-tabs-pill"
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </motion.div>
  );
}
