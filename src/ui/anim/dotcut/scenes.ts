// dotcut scenes —— 场景/过渡/纹理场/调色板（vendored，见 ATTRIBUTION.md）
export interface Scene {
  kind: "text" | "rings" | "checker" | "bars" | "columns" | "boxes";
  value?: string;
  transition: TransitionKind;
  palette: number;
  style?: StyleKind;
}

export type TransitionKind = "wipe" | "ripple" | "scatter" | "collapse" | "columns";

export function cellMotion(
  kind: TransitionKind,
  t: number,
  dir: number,
  rand: number,
): { scale: number; dx: number; dy: number; spin: number } {
  const u = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
  switch (kind) {
    case "wipe":
      return { scale: 1, dx: u * 0.16 * -dir, dy: 0, spin: 0 };
    case "ripple":
      return { scale: 1 - u * 0.10, dx: 0, dy: u * -0.13, spin: 0 };
    case "scatter":
      return {
        scale: 1,
        dx: u * 0.18 * Math.cos(rand * Math.PI * 2),
        dy: u * 0.18 * Math.sin(rand * Math.PI * 2),
        spin: 0,
      };
    case "collapse":
      return { scale: 1 - u * 0.18, dx: 0, dy: 0, spin: 0 };
    case "columns":
      return { scale: 1, dx: 0, dy: u * 0.22, spin: 0 };
  }
}

export type StyleKind = "drift" | "grain" | "swell" | "streak" | null;

function smooth01(v: number, e0: number, e1: number): number {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export const SCENES: Scene[] = [
  { kind: "text", value: "A", transition: "wipe", palette: 0, style: "drift" },
  { kind: "rings", transition: "ripple", palette: 1, style: "grain" },
  { kind: "columns", transition: "columns", palette: 2, style: "streak" },
  { kind: "checker", transition: "scatter", palette: 3, style: "swell" },
  { kind: "boxes", transition: "collapse", palette: 4, style: "grain" },
  { kind: "bars", transition: "wipe", palette: 5, style: "drift" },
];

export function styleField(
  scene: Scene,
  cols: number,
  rows: number,
  t: number,
  out: Float32Array,
  prev?: Scene,
) {
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const maxR = Math.hypot(cols, rows) / 2;
  const FLIP = 0.32;

  const stateOf = (style: StyleKind | undefined, x: number, y: number): number => {
    switch (style) {
      case "drift": {
        const a = Math.sin(x * 0.41 + y * 0.23);
        const b = Math.sin(x * 0.17 - y * 0.53 + 2.1);
        return smooth01((a + b) * 0.5, -0.15, 0.75);
      }
      case "grain": {
        const n =
          hash2(x, y) * 0.55 + hash2(x + 1, y) * 0.15 + hash2(x, y + 1) * 0.15 + hash2(x + 1, y + 1) * 0.15;
        return smooth01(n, 0.34, 0.86);
      }
      case "swell": {
        const d = Math.hypot(x - cx, y - cy) / maxR;
        const warp = Math.sin(Math.atan2(y - cy, x - cx) * 3.0) * 0.14;
        return smooth01(1 - (d + warp), 0.28, 0.92);
      }
      case "streak": {
        const s = Math.sin(x * 0.28 + y * 0.62);
        const cut = Math.sin(x * 0.09 - y * 0.11 + 1.3) * 0.5 + 0.5;
        return smooth01(s * cut, -0.05, 0.7);
      }
      default:
        return 0;
    }
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let order = 0;
      switch (scene.style) {
        case "drift":
          order = (x / cols) * 0.75 + Math.sin(y * 0.5) * 0.12 + 0.12;
          break;
        case "grain":
          order = (x / cols) * 0.55 + (y / rows) * 0.25 + hash2(x, y) * 0.2;
          break;
        case "swell":
          order = Math.hypot(x - cx, y - cy) / maxR;
          break;
        case "streak":
          order = (x / cols) * 0.8 + (y / rows) * 0.2;
          break;
      }
      const from = stateOf(prev?.style ?? scene.style, x, y);
      const to = stateOf(scene.style, x, y);
      const u = Math.min(1, Math.max(0, (t - order * (1 - FLIP)) / FLIP));
      const eased = u * u * (3 - 2 * u);
      out[y * cols + x] = from + (to - from) * eased;
    }
  }
}

export const PALETTES: [string, string][] = [
  ["#8aa9ff", "#1f45f5"],
  ["#ffd166", "#e5484d"],
  ["#b8f2c9", "#0f8a5f"],
  ["#ffc2e2", "#c81d77"],
  ["#c7d2fe", "#4338ca"],
  ["#fde68a", "#b45309"],
];

/** 在网格分辨率栅格化符号：1=保留圆，0=挖空 */
export function rasterize(scene: Scene, cols: number, rows: number, fontFamily: string): Float32Array {
  const out = new Float32Array(cols * rows).fill(1);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;

  if (scene.kind === "checker") {
    const b = Math.max(2, Math.round(cols / 14));
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if ((Math.floor(x / b) + Math.floor(y / b)) % 2 === 0) out[y * cols + x] = 0;
    return out;
  }
  if (scene.kind === "bars") {
    const period = 3;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if (Math.floor((x + y) / period) % 2 === 0) out[y * cols + x] = 0;
    return out;
  }
  if (scene.kind === "columns") {
    const bw = 4;
    const bh = 3;
    for (let y = 0; y < rows; y++) {
      const band = Math.floor(y / bh);
      const shift = band % 2 === 0 ? 0 : bw / 2;
      for (let x = 0; x < cols; x++)
        if (Math.floor((x + shift) / bw) % 2 === 0) out[y * cols + x] = 0;
    }
    return out;
  }
  if (scene.kind === "boxes") {
    const period = 2.5;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
        if (Math.floor(d / period) % 2 === 0) out[y * cols + x] = 0;
      }
    return out;
  }
  if (scene.kind === "rings") {
    const maxR = Math.hypot(cols, rows) / 2;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const d = Math.hypot(x - cx, y - cy) / maxR;
        if (Math.floor(d * 6.0) % 2 === 0) out[y * cols + x] = 0;
      }
    return out;
  }

  // 3× 超采样灰度抗锯齿：高分辨率栅格化后按格平均覆盖率，
  // 镗刻字符边缘得到 0..1 灰度渐变 → 更细更清晰的光栅文字
  const SS = 3;
  const cv = document.createElement("canvas");
  cv.width = cols * SS;
  cv.height = rows * SS;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;

  const text = (scene.value || "").trim();
  if (!text) return out;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let size = rows * SS * 0.8;
  ctx.font = "700 " + size + "px " + fontFamily;
  const maxW = cols * SS * 0.62;
  let m = ctx.measureText(text);
  if (m.width > maxW) {
    size *= maxW / m.width;
    ctx.font = "700 " + size + "px " + fontFamily;
  }
  const maxH = rows * SS * 0.58;
  const mm = ctx.measureText(text);
  const gh = mm.actualBoundingBoxAscent + mm.actualBoundingBoxDescent;
  if (gh > maxH) {
    size *= maxH / gh;
    ctx.font = "700 " + size + "px " + fontFamily;
  }
  ctx.fillText(text, (cols * SS) / 2, (rows * SS) / 2 + rows * SS * 0.02);

  const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (y * SS + sy) * cv.width + (x * SS + sx);
          if (data[px * 4] > 110) hit++;
        }
      }
      const cov = hit / (SS * SS);
      if (cov > 0) out[y * cols + x] = 1 - cov; // 覆盖率=镗刻深度，边缘灰度渐变
    }
  }
  return out;
}

export function cellDelay(
  kind: TransitionKind,
  x: number,
  y: number,
  cols: number,
  rows: number,
  rand: number,
): number {
  const fx = cols > 1 ? x / (cols - 1) : 0;
  const fy = rows > 1 ? y / (rows - 1) : 0;
  switch (kind) {
    case "wipe":
      return Math.min(1, Math.max(0, (fx * 0.75 + fy * 0.25) * 0.85 + rand * 0.15));
    case "ripple": {
      const d = Math.hypot(fx - 0.5, fy - 0.5) / 0.707;
      return Math.min(1, d * 0.9 + rand * 0.1);
    }
    case "scatter":
      return rand;
    case "collapse": {
      const d = Math.hypot(fx - 0.5, fy - 0.5) / 0.707;
      return Math.min(1, (1 - d) * 0.85 + rand * 0.15);
    }
    case "columns":
      return Math.min(1, fx * 0.9 + rand * 0.1);
  }
}
