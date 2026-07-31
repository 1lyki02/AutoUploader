import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

function externalizeNodeModules(id: string): boolean {
  if (id.startsWith(".") || path.isAbsolute(id)) return false;
  return !id.startsWith("@autouploader/");
}

export default defineConfig({
  server: { host: "127.0.0.1" },
  plugins: [
    react(),
    electron({
      main: {
        entry: "./src/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            rollupOptions: { external: externalizeNodeModules },
          },
        },
      },
      preload: {
        input: "./src/preload/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/preload",
            rollupOptions: {
              external: externalizeNodeModules,
              output: {
                format: "cjs",
                entryFileNames: "index.cjs",
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  build: { outDir: "dist" },
});
