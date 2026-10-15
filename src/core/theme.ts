// 页面主题检测：Shadow Root 内组件用 dataset，页内注入按钮用 html.xmd-dark 类。

/** 跟随 X 主题：按 body/html 背景亮度判断明暗（透明背景视为浅色） */
export function detectTheme(): "dark" | "light" {
  try {
    const read = (el: Element) => getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number);
    let m = read(document.body);
    // body 透明时回退到 html
    if (!m || (m.length === 4 && m[3] === 0)) m = read(document.documentElement);
    if (m && m.length >= 3 && !(m.length === 4 && m[3] === 0)) {
      const lum = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
      return lum < 90 ? "dark" : "light";
    }
  } catch { /* ignore */ }
  return "light";
}

/** 检测并同步 html 主题类（页内注入样式的暗色变体开关），返回主题 */
export function applyThemeClass(): "dark" | "light" {
  const t = detectTheme();
  document.documentElement.classList.toggle("xmd-dark", t === "dark");
  return t;
}
