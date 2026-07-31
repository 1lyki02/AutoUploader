import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: {
      "@autouploader/shared": path.resolve(root, "../../../packages/shared/src/index.ts"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5180,
    strictPort: true,
    // Cloudflare / localtunnel hostnames change each run
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(root, "dist"),
    emptyOutDir: true,
  },
});
