import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// 内容脚本必须是单个 IIFE 文件；manifest/background/icons 从 extension/ 拷入 dist/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-extension-static",
      closeBundle() {
        const root = process.cwd();
        const dist = resolve(root, "dist");
        for (const f of ["manifest.json", "background.js", "injected.js"]) {
          cpSync(resolve(root, "extension", f), resolve(dist, f), { force: true });
        }
        // 逐文件拷贝图标（该环境下 cpSync 递归目录拷贝不稳定）
        const iconsSrc = resolve(root, "extension/icons");
        if (existsSync(iconsSrc)) {
          const iconsDist = resolve(dist, "icons");
          mkdirSync(iconsDist, { recursive: true });
          for (const f of readdirSync(iconsSrc)) {
            cpSync(resolve(iconsSrc, f), resolve(iconsDist, f), { force: true });
          }
        }
        // CSS 资产统一命名为 styles.css（content.tsx 运行时 fetch 它），并移除原始资产
        for (const f of readdirSync(dist)) {
          if (f.endsWith(".css")) {
            if (f !== "styles.css") {
              cpSync(resolve(dist, f), resolve(dist, "styles.css"), { force: true });
              rmSync(resolve(dist, f));
            }
          }
        }
      },
    },
  ],
  resolve: {
    alias: { "@": resolve(process.cwd(), "src") },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome118",
    minify: true,
    lib: {
      entry: resolve(process.cwd(), "src/content.tsx"),
      formats: ["iife"],
      name: "XMD",
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
