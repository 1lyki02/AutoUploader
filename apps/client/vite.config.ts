import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

// Node-process code (main/preload) should never bundle third-party npm
// dependencies: native addons like better-sqlite3 rely on a real on-disk
// node_modules location to find their compiled .node binary, and bundling
// can break that. Our own workspace TS packages (@autouploader/*) are the
// opposite case — they ship raw .ts source with no build step, so Node
// can't `require()` them directly and they must be bundled like our own code.
function externalizeNodeModules(id: string): boolean {
  if (id.startsWith(".") || path.isAbsolute(id)) return false;
  if (id.startsWith("@autouploader/")) return false;
  return true;
}

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "./src/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            rollupOptions: {
              external: externalizeNodeModules,
            },
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
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  build: {
    outDir: "dist",
  },
});
