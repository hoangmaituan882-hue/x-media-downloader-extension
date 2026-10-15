import { useState } from "react";

export function ToggleSwitch({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  const [init, setInit] = useState(false);

  return (
    <button
      type="button"
      className={`t-toggle${init ? " is-init" : ""}${className ? " " + className : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-on={checked ? "true" : "false"}
      onClick={() => {
        setInit(true);
        onChange(!checked);
      }}
    >
      <span className="t-toggle-thumb" />
    </button>
  );
}
