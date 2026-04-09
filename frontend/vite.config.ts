import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 与 Vue 前端 `frontend` 默认一致（WeKnora `config` 常见端口 8080）；可用 `VITE_DEV_BACKEND` 覆盖。 */
const backend = process.env.VITE_DEV_BACKEND ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../bin/web",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 7777,
    host: "0.0.0.0",
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/files": { target: backend, changeOrigin: true },
      "/health": { target: backend, changeOrigin: true },
      "/threads": { target: backend, changeOrigin: true },
      "/runs": { target: backend, changeOrigin: true },
    },
    hmr: process.env.DISABLE_HMR !== "true",
  },
});
