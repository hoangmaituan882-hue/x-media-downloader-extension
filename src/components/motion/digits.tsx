import { memo } from "react";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function ReelColumn({ char, delay }: { char: string; delay: number }) {
  const isDigit = /^[0-9]$/.test(char);
  if (!isDigit) {
    return <span className="inline-block">{char}</span>;
  }

  const d = parseInt(char, 10);

  return (
    <span
      className="inline-block relative overflow-hidden"
      style={{
        height: "1em",
        lineHeight: "1em",
        verticalAlign: "-0.1em",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%)",
        maskImage: "linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%)",
      }}
    >
      <span
        className="flex flex-col will-change-transform"
        style={{
          transform: `translateY(-${d * 10}%)`,
          transition: `transform 420ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        }}
      >
        {DIGITS.map(num => (
          <span
            key={num}
            className="flex items-center justify-center select-none"
            style={{ height: "1em", lineHeight: "1em" }}
          >
            {num}
          </span>
        ))}
      </span>
    </span>
  );
}

export const Digits = memo(function Digits({
  value,
  className,
}: {
  value: number | string;
  className?: string;
}) {
  const str = String(value);

  return (
    <span className={`inline-flex items-center font-mono tabular-nums ${className || ""}`}>
      {str.split("").map((c, i) => (
        <ReelColumn key={i} char={c} delay={(str.length - 1 - i) * 40} />
      ))}
    </span>
  );
});
