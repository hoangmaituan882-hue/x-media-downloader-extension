import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// 画廊页构建：标准多资源构建，base 相对路径（扩展页面加载本地资产）。
// 必须在 content 构建之后跑（emptyOutDir false，不擦除 content 产物）。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(process.cwd(), "gallery.html"),
    },
  },
});
