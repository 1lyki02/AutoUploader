import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  noExternal: ["@autouploader/shared", "@autouploader/automation"],
  external: [
    /^(patchright|patchright-core|playwright-core|camoufox-js)(\/.*)?$/,
    /^(googleapis|google-auth-library|chromium-bidi)(\/.*)?$/,
  ],
});
