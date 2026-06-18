import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  // 自定义缓存目录,避免污染 node_modules
  cacheDir: path.resolve(__dirname, ".vite-cache"),
  server: {
    port: 1420,
    strictPort: false,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2020",
    // 启用 Rollup 文件系统缓存,大幅提升二次构建速度
    cache: {
      dir: path.resolve(__dirname, ".vite-cache", "build"),
      // 缓存策略:基于内容哈希,内容不变则复用缓存
      strategy: "content-hash",
    },
    // 使用 esbuild 压缩,比 terser 更快
    minify: "esbuild",
    // 关闭源码映射以加速生产构建
    sourcemap: false,
    // CSS 代码分割
    cssCodeSplit: true,
    // 分块策略:把大型依赖单独拆包,提升缓存命中率
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          dnd: ["@hello-pangea/dnd"],
          tauri: [
            "@tauri-apps/api",
            "@tauri-apps/plugin-dialog",
            "@tauri-apps/plugin-fs",
            "@tauri-apps/plugin-notification",
            "@tauri-apps/plugin-shell",
          ],
        },
      },
    },
  },
}));
