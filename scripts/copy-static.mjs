import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const ext = resolve(root, "extension");

console.log("[build] Copying static assets from", ext, "to", dist);

mkdirSync(dist, { recursive: true });

// 复制 manifest.json, background.js, injected.js
for (const f of ["manifest.json", "background.js", "injected.js"]) {
  const src = resolve(ext, f);
  const dest = resolve(dist, f);
  if (existsSync(src)) {
    const raw = readFileSync(src);
    writeFileSync(dest, raw);
    console.log(`[build] Wrote ${f} (${raw.length} bytes) -> dist/${f}`);
  } else {
    console.warn(`[build] Missing source file: ${src}`);
  }
}

// 复制 icons
const iconsSrc = resolve(ext, "icons");
if (existsSync(iconsSrc)) {
  const iconsDist = resolve(dist, "icons");
  mkdirSync(iconsDist, { recursive: true });
  for (const f of readdirSync(iconsSrc)) {
    copyFileSync(resolve(iconsSrc, f), resolve(iconsDist, f));
  }
  console.log(`[build] Copied icons -> dist/icons`);
}

// 规范化 CSS 为 styles.css
if (existsSync(dist)) {
  for (const f of readdirSync(dist)) {
    if (f.endsWith(".css") && f !== "styles.css") {
      copyFileSync(resolve(dist, f), resolve(dist, "styles.css"));
      rmSync(resolve(dist, f));
      console.log(`[build] Normalized ${f} -> styles.css`);
    }
  }
}

console.log("[build] Post-build static asset copy completed successfully.");
